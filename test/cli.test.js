import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';

const exec = promisify(execFile);
const bin = fileURLToPath(new URL('../bin/comment-to-code.js', import.meta.url));
const repository = { owner: 'example', name: 'project', host: 'github.com', url: 'https://github.com/example/project' };
const evidence = () => ({ version: 1, repository, capturedAt: new Date().toISOString(), pullRequests: [] });
const output = { write() {} };

async function checkout(t) {
  const root = await mkdtemp(join(tmpdir(), 'ctc-cli-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', '-q', root]);
  await exec('git', ['remote', 'add', 'origin', repository.url], { cwd: root });
  const nested = join(root, 'src', 'nested');
  await mkdir(nested, { recursive: true });
  const tools = join(root, 'fixture-bin');
  await mkdir(tools);
  await writeFile(join(tools, 'gh'), `#!${process.execPath}\nconst args=process.argv.slice(2); if(args[0]==='repo') process.stdout.write(JSON.stringify({name:'project',owner:{login:'example'},url:'https://github.com/example/project'})); else if(args[0]==='api') process.stdout.write('[]'); else process.exit(1);\n`);
  await chmod(join(tools, 'gh'), 0o755);
  const env = { ...process.env, PATH: `${tools}:${process.env.PATH}` };
  const cli = (...args) => exec(process.execPath, [bin, ...args], { cwd: nested, env });
  const identify = async () => ({ cwd: root, repository });
  return { root, nested, cli, identify };
}

test('real executable supports help/version and rejects invalid options', async t => {
  const { cli } = await checkout(t);
  assert.match((await cli('--help')).stdout, /capture[\s\S]*analyze[\s\S]*run/);
  assert.match((await cli('--version')).stdout, /^0\.1\.0\n$/);
  for (const args of [['analyze'], ['run', '--agent', 'other'], ['capture', '--model', 'x'], ['analyze', '--agent', 'omp', '--max-input-bytes', 'NaN'], ['analyze', '--agent', 'omp', '--agent', 'codex']]) await assert.rejects(cli(...args), /comment-to-code:/);
});

test('real checkout nested install/capture/analyze/run use root and all three skills', async t => {
  const { root, nested, cli } = await checkout(t);
  await writeFile(join(root, '.gitignore'), 'user-ignore\n');
  await cli('install', '--agent', 'all');
  for (const agent of ['.omp', '.claude', '.agents']) assert.match(await readFile(join(root, agent, 'skills/comment-to-code/SKILL.md'), 'utf8'), /name: comment-to-code/);
  await assert.rejects(stat(join(nested, '.comment-to-code')), { code: 'ENOENT' });
  await cli('capture');
  const captured = JSON.parse(await readFile(join(root, '.comment-to-code/capture.json'), 'utf8'));
  assert.deepEqual(captured.repository, repository);
  const analyzed = await cli('analyze', '--agent', 'omp');
  assert.match(analyzed.stdout, /Published 0/);
  for (const file of ['rules.md', 'AGENTS.md', 'CLAUDE.md']) assert.ok((await readFile(join(root, file), 'utf8')).length > 0);
  await cli('run', '--agent', 'codex', '--max-input-bytes', '4096');
  assert.match(await readFile(join(root, '.gitignore'), 'utf8'), /^user-ignore\n/);
  assert.equal((await readFile(join(root, '.gitignore'), 'utf8')).match(/\/\.comment-to-code\//g).length, 1);
  assert.equal((await stat(join(root, '.comment-to-code'))).mode & 0o777, 0o700);
  assert.equal((await stat(join(root, '.comment-to-code/capture.json'))).mode & 0o777, 0o600);
});

test('capture and analysis failures retain previous successful artifacts', async t => {
  const { root, identify } = await checkout(t);
  const options = { cwd: root, identify, stdout: output };
  await main(['capture'], { ...options, capture: async () => evidence() });
  const capturePath = join(root, '.comment-to-code/capture.json');
  const before = await readFile(capturePath, 'utf8');
  await assert.rejects(main(['capture'], { ...options, capture: async () => { throw new Error('rate limited'); } }), /rate limited/);
  assert.equal(await readFile(capturePath, 'utf8'), before);
  await main(['analyze', '--agent', 'omp'], options);
  const analysisPath = join(root, '.comment-to-code/analysis.json');
  const previous = await readFile(analysisPath, 'utf8');
  const rules = await readFile(join(root, 'rules.md'), 'utf8');
  await assert.rejects(main(['analyze', '--agent', 'omp'], { ...options, analyze: async () => { throw new Error('provider failed'); } }), /provider failed/);
  assert.equal(await readFile(analysisPath, 'utf8'), previous);
  assert.equal(await readFile(join(root, 'rules.md'), 'utf8'), rules);
  assert.deepEqual((await readdir(join(root, '.comment-to-code'))).sort(), ['analysis.json', 'capture.json']);
});

test('analysis rejects absent, cross-repository, stale, and malformed captures', async t => {
  const { root, identify } = await checkout(t);
  const options = { cwd: root, identify, stdout: output, runAgent: async () => { throw new Error('must not call model'); } };
  await assert.rejects(main(['analyze', '--agent', 'omp'], options), /No capture/);
  const file = join(root, '.comment-to-code/capture.json');
  for (const value of [{ ...evidence(), repository: { ...repository, owner: 'other' } }, { ...evidence(), capturedAt: '2020-01-01T00:00:00Z' }, { ...evidence(), version: 0 }, { ...evidence(), pullRequests: [{}] }]) {
    await writeFile(file, JSON.stringify(value));
    await assert.rejects(main(['analyze', '--agent', 'omp'], options), /another repository|stale|Malformed PR/);
  }
  await writeFile(file, 'not-json');
  await assert.rejects(main(['analyze', '--agent', 'omp'], options), /Malformed JSON/);
});

test('cache protections reject tracked cache, symlink directory/ancestor/ignore and effective unignore', async t => {
  for (const scenario of ['tracked', 'cache', 'ignore', 'ancestor', 'unignore']) {
    const { root, identify } = await checkout(t);
    const outside = await mkdtemp(join(tmpdir(), 'ctc-outside-'));
    t.after(() => rm(outside, { recursive: true, force: true }));
    if (scenario === 'tracked') {
      await mkdir(join(root, '.comment-to-code'));
      await writeFile(join(root, '.comment-to-code/old.json'), 'private');
      await exec('git', ['add', '.comment-to-code/old.json'], { cwd: root });
    } else if (scenario === 'cache') await symlink(outside, join(root, '.comment-to-code'));
    else if (scenario === 'ignore') { await writeFile(join(outside, 'ignore'), 'user'); await symlink(join(outside, 'ignore'), join(root, '.gitignore')); }
    else if (scenario === 'ancestor') { await symlink(root, join(outside, 'alias')); }
    else {
      await mkdir(join(root, '.comment-to-code'));
      await writeFile(join(root, '.comment-to-code/.gitignore'), '!capture.json\n!analysis.json\n');
      await writeFile(join(root, '.gitignore'), '/.comment-to-code/*\n!/.comment-to-code/\n');
    }
    let captured = false;
    const selectedIdentify = scenario === 'ancestor' ? async () => ({ repository, cwd: join(outside, 'alias') }) : identify;
    // A root directory ignore takes precedence over nested negations: this case remains safe.
    if (scenario === 'unignore') {
      await main(['capture'], { cwd: root, identify: selectedIdentify, stdout: output, capture: async () => evidence() });
    } else {
      await assert.rejects(main(['capture'], { cwd: root, identify: selectedIdentify, stdout: output, capture: async () => { captured = true; return evidence(); } }), /tracked|symlink/);
      assert.equal(captured, false);
      await assert.rejects(stat(join(outside, 'capture.json')), { code: 'ENOENT' });
    }
  }
});

test('CLI passes selected backend/model/input limit through real analysis boundary', async t => {
  const { root, identify } = await checkout(t);
  await main(['capture'], { cwd: root, identify, stdout: output, capture: async () => evidence() });
  let received;
  await main(['analyze', '--agent', 'claude', '--model', 'literal;name', '--max-input-bytes', '4096'], {
    cwd: root, identify, stdout: output,
    analyze: async (capture, options) => { received = { capture, maxInputBytes: options.maxInputBytes }; await options.runAgent('private'); return { version: 1, repository, rules: [], candidates: [], findings: [], groups: [], analyzedAt: new Date().toISOString(), stats: { comments: 0, analyzed: 0, cached: 0, rules: 0, candidates: 0 } }; },
    runAgent: async (...args) => { assert.deepEqual(args, ['claude', 'private', { model: 'literal;name' }]); return '{}'; },
  });
  assert.equal(received.maxInputBytes, 4096);
  assert.deepEqual(received.capture.repository, repository);
});
