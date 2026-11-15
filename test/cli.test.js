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

function reviewedHistory(counts = [17, 1]) {
  return {
    ...evidence(),
    pullRequests: counts.map((count, index) => {
      const number = index + 1;
      const sha = String(number).repeat(40);
      const patch = '@@ -1 +1 @@\n-return input.value;\n+return input?.value;';
      return {
        number, title: 'Handle absent input', body: '', url: `${repository.url}/pull/${number}`,
        state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', baseSha: '0'.repeat(40), headSha: sha,
        comments: Array.from({ length: count }, (_, i) => ({
          id: `inline:${number}:${String(i + 1).padStart(2, '0')}`, kind: 'inline', body: 'PRIVATE REVIEW: this input can be absent.',
          url: `${repository.url}/pull/${number}#discussion_r${i + 1}`, author: 'reviewer',
          createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
          threadId: `thread:${number}`, path: 'input.js', line: 1, originalCommitId: '0'.repeat(40), diffHunk: patch,
        })),
        commits: [{ sha, message: 'Guard absent input', authoredAt: '2026-01-01T00:00:00Z', files: [{ path: 'input.js', previousPath: null, status: 'modified', patch }], limitations: [] }],
        files: [{ path: 'input.js', previousPath: null, status: 'modified', patch }],
        sources: [], limitations: [],
      };
    }),
  };
}

// Injectable transport fixtures exercise the real CLI/analyzer/publisher, not a real provider.
function fixtureAgent({ beforeBatch, consolidate } = {}) {
  const batches = [];
  const consolidations = [];
  return {
    batches, consolidations,
    async runAgent(_agent, prompt) {
      const data = JSON.parse(prompt.slice(prompt.indexOf('\nDATA ') + 6));
      if (data.targets) {
        batches.push(data.targets);
        await beforeBatch?.(data, batches.length);
        return JSON.stringify({ findings: data.targets.map(({ prNumber, commentId }) => {
          const pr = data.pullRequests.find(pr => pr.number === prNumber);
          return {
            commentId, category: 'defect', rootCause: 'Dereferencing optional input without an absence guard',
            prevention: 'Guard optional inputs before dereferencing them.', resolution: 'Optional chaining guards absent input.',
            evidence: [pr.commits[0].sha], confidence: 'high', status: 'confirmed', outcome: 'verified-fix',
            codeEvidence: [{ ref: pr.commits[0].sha, path: 'input.js', quote: '+return input?.value;' }],
          };
        }) });
      }
      consolidations.push(data);
      return JSON.stringify(consolidate ? await consolidate(data) : { groups: [{
        rootCause: 'Dereferencing optional input without an absence guard',
        prevention: 'Guard optional inputs before dereferencing them.',
        incidents: data.findings.map(finding => ({ commentIds: [finding.commentId], explanation: 'An observed absent-input defect.' })),
      }] });
    },
  };
}

async function publishedArtifacts(root) {
  const files = ['.comment-to-code/analysis.json', 'rules.md', 'AGENTS.md', 'CLAUDE.md'];
  return Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(join(root, file), 'utf8')])));
}

async function checkpointEntries(root) {
  const directory = join(root, '.comment-to-code/findings');
  return Promise.all((await readdir(directory)).sort().map(async name => ({
    name, path: join(directory, name), finding: JSON.parse(await readFile(join(directory, name), 'utf8')),
  })));
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

test('validated batches survive provider failure and resume only remaining targets without extra incidents', async t => {
  const { root, identify } = await checkout(t);
  let progress = '';
  const options = { cwd: root, identify, stdout: { write(text) { progress += text; } } };
  await writeFile(join(root, 'AGENTS.md'), 'Human instructions.\n');
  await main(['run', '--agent', 'omp'], { ...options, capture: async () => evidence() });
  const previous = await publishedArtifacts(root);
  const input = reviewedHistory();
  await main(['capture'], { ...options, capture: async () => input });
  const interrupted = fixtureAgent({ beforeBatch: (_data, count) => { if (count === 2) throw new Error('provider unavailable'); } });
  await assert.rejects(main(['analyze', '--agent', 'omp'], { ...options, runAgent: interrupted.runAgent }), /provider unavailable/);
  assert.deepEqual(interrupted.batches.map(batch => batch.length), [16, 2]);
  assert.deepEqual(await publishedArtifacts(root), previous);
  const checkpoints = await checkpointEntries(root);
  assert.equal(checkpoints.length, 16);
  assert.equal((await stat(join(root, '.comment-to-code/findings'))).mode & 0o777, 0o700);
  for (const entry of checkpoints) {
    assert.match(entry.name, /^[a-f0-9]{64}\.json$/);
    assert.equal(entry.name, `${entry.finding.inputHash}.json`);
    assert.equal((await stat(entry.path)).mode & 0o777, 0o600);
    assert.equal(entry.finding.status, 'confirmed');
    assert.equal(Object.hasOwn(entry.finding, 'groups'), false);
    assert.equal(Object.hasOwn(entry.finding, 'rules'), false);
  }
  assert.match(progress, /Checkpointed 16 finding\(s\) \(16 this run\)/);
  assert.doesNotMatch(progress, /PRIVATE REVIEW|return input|github\.com/);
  const resumed = fixtureAgent();
  const analysis = await main(['analyze', '--agent', 'omp'], { ...options, runAgent: resumed.runAgent });
  const cachedIds = new Set(checkpoints.map(entry => entry.finding.commentId));
  assert.deepEqual(resumed.batches.flat().map(target => target.commentId).sort(), input.pullRequests.flatMap(pr => pr.comments.map(comment => comment.id)).filter(id => !cachedIds.has(id)).sort());
  assert.deepEqual(analysis.stats, { comments: 18, analyzed: 2, cached: 16, rules: 1, candidates: 0 });
  assert.equal(new Set(analysis.findings.map(finding => finding.commentId)).size, 18);
  assert.equal(resumed.consolidations.length, 1);
  assert.equal(resumed.consolidations[0].findings.length, 18);
  assert.equal(analysis.groups[0].incidents.length, 2);
  assert.equal(analysis.rules[0].incidentCount, 2);
  assert.equal((await checkpointEntries(root)).length, 18);
  assert.deepEqual(JSON.parse(await readFile(join(root, '.comment-to-code/analysis.json'), 'utf8')), analysis);
  assert.match(progress, /Reused 16 checkpoint finding\(s\)/);
  assert.match(await readFile(join(root, 'AGENTS.md'), 'utf8'), /^Human instructions\.\n/);

  // A complete previous analysis wins before independent checkpoint lookup.
  await writeFile(checkpoints[0].path, 'not-json');
  const previousOnly = fixtureAgent();
  const cached = await main(['analyze', '--agent', 'omp'], { ...options, runAgent: previousOnly.runAgent });
  assert.equal(previousOnly.batches.length, 0);
  assert.equal(cached.stats.cached, 18);
  assert.equal(cached.rules[0].incidentCount, 2);

  // Every finding in a changed PR has a new context hash; stale checkpoints cannot satisfy it.
  input.pullRequests[0].comments[0].body += ' The reviewed context changed.';
  await main(['capture'], { ...options, capture: async () => input });
  const changed = fixtureAgent();
  const refreshed = await main(['analyze', '--agent', 'omp'], { ...options, runAgent: changed.runAgent });
  assert.deepEqual(changed.batches.map(batch => batch.length), [16, 1]);
  assert.equal(refreshed.stats.analyzed, 17);
  assert.equal(refreshed.stats.cached, 1);
  assert.equal(refreshed.rules[0].incidentCount, 2);
});

test('consolidation and publication failure retain checkpoints and previous complete documents', async t => {
  for (const failure of ['consolidation', 'publication']) await t.test(failure, async t => {
    const { root, identify } = await checkout(t);
    const options = { cwd: root, identify, stdout: output };
    await main(['run', '--agent', 'omp'], { ...options, capture: async () => evidence() });
    const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
    if (failure === 'publication') await writeFile(join(root, 'AGENTS.md'), `${agents}\n<!-- comment-to-code:start -->\n`);
    const previous = await publishedArtifacts(root);
    await main(['capture'], { ...options, capture: async () => reviewedHistory([1, 1]) });
    const interrupted = fixtureAgent(failure === 'consolidation' ? { consolidate: () => ({ groups: [] }) } : {});
    await assert.rejects(main(['analyze', '--agent', 'omp'], { ...options, runAgent: interrupted.runAgent }), failure === 'consolidation' ? /omitted/ : /block|marker/i);
    assert.deepEqual(await publishedArtifacts(root), previous);
    assert.equal((await checkpointEntries(root)).length, 2);
    if (failure === 'publication') await writeFile(join(root, 'AGENTS.md'), agents);
    const resumed = fixtureAgent();
    const analysis = await main(['analyze', '--agent', 'omp'], { ...options, runAgent: resumed.runAgent });
    assert.equal(resumed.batches.length, 0);
    assert.equal(analysis.stats.cached, 2);
    assert.equal(analysis.rules[0].incidentCount, 2);
  });
});

test('checkpoint loads reject corrupt, mismatched, tracked, and unsafe paths before model use', async t => {
  for (const scenario of ['json', 'null', 'hash', 'identity', 'evidence', 'tracked', 'directory-symlink', 'file-symlink', 'nonregular']) await t.test(scenario, async t => {
    const { root, identify } = await checkout(t);
    const options = { cwd: root, identify, stdout: output };
    await main(['capture'], { ...options, capture: async () => reviewedHistory([1]) });
    const initial = fixtureAgent({ consolidate: () => ({ groups: [] }) });
    await assert.rejects(main(['analyze', '--agent', 'omp'], { ...options, runAgent: initial.runAgent }), /omitted/);
    const [entry] = await checkpointEntries(root);
    if (scenario === 'json') await writeFile(entry.path, '{');
    else if (scenario === 'null') await writeFile(entry.path, 'null');
    else if (scenario === 'hash') await writeFile(entry.path, JSON.stringify({ ...entry.finding, inputHash: 'a'.repeat(64) === entry.finding.inputHash ? 'b'.repeat(64) : 'a'.repeat(64) }));
    else if (scenario === 'identity') await writeFile(entry.path, JSON.stringify({ ...entry.finding, commentId: 'invented' }));
    else if (scenario === 'evidence') await writeFile(entry.path, JSON.stringify({ ...entry.finding, evidence: ['https://example.invalid/fabricated'] }));
    else if (scenario === 'tracked') await exec('git', ['add', '-f', entry.path], { cwd: root });
    else if (scenario === 'nonregular') { await rm(entry.path); await mkdir(entry.path); }
    else {
      const outside = await mkdtemp(join(tmpdir(), 'ctc-checkpoint-outside-'));
      t.after(() => rm(outside, { recursive: true, force: true }));
      await writeFile(join(outside, entry.name), JSON.stringify(entry.finding));
      if (scenario === 'directory-symlink') {
        await rm(join(root, '.comment-to-code/findings'), { recursive: true });
        await symlink(outside, join(root, '.comment-to-code/findings'));
      } else {
        await rm(entry.path);
        await symlink(join(outside, entry.name), entry.path);
      }
    }
    let called = false;
    await assert.rejects(main(['analyze', '--agent', 'omp'], { ...options, runAgent: async () => { called = true; throw new Error('must not call model'); } }), /Malformed|input hash|identity|fabricated|tracked|symlink|regular file/i);
    assert.equal(called, false);
    await assert.rejects(stat(join(root, '.comment-to-code/analysis.json')), { code: 'ENOENT' });
  });
});

test('checkpoint callbacks reject non-digest path names', async t => {
  const { root, identify } = await checkout(t);
  const options = { cwd: root, identify, stdout: output };
  await main(['capture'], { ...options, capture: async () => evidence() });
  for (const inputHash of ['../outside', 'A'.repeat(64), 'a'.repeat(63), null]) {
    for (const operation of ['load', 'save']) {
      await assert.rejects(main(['analyze', '--agent', 'omp'], {
        ...options,
        analyze: async (_capture, callbacks) => operation === 'load' ? callbacks.loadFinding(inputHash) : callbacks.saveFindings([{ inputHash }]),
      }), /Invalid finding input hash/);
    }
  }
  await assert.rejects(stat(join(root, '.comment-to-code/findings')), { code: 'ENOENT' });
});

test('checkpoint writes recheck effective ignore and tracked paths after model execution', async t => {
  for (const scenario of ['unignored', 'temporary-unignored', 'tracked', 'symlink']) await t.test(scenario, async t => {
    const { root, identify } = await checkout(t);
    const options = { cwd: root, identify, stdout: output };
    await main(['run', '--agent', 'omp'], { ...options, capture: async () => evidence() });
    const previous = await publishedArtifacts(root);
    await main(['capture'], { ...options, capture: async () => reviewedHistory([1]) });
    const agent = fixtureAgent({ beforeBatch: async () => {
      if (scenario === 'tracked') {
        await writeFile(join(root, '.comment-to-code/new-private.json'), '{}');
        await exec('git', ['add', '-f', '.comment-to-code/new-private.json'], { cwd: root });
      } else if (scenario === 'symlink') {
        await symlink(root, join(root, '.comment-to-code/findings'));
      } else {
        await writeFile(join(root, '.gitignore'), `/.comment-to-code/\n!/.comment-to-code/\n/.comment-to-code/capture.json\n/.comment-to-code/analysis.json\n${scenario === 'temporary-unignored' ? '/.comment-to-code/findings/*.json\n' : ''}`);
      }
    } });
    await assert.rejects(main(['analyze', '--agent', 'omp'], { ...options, runAgent: agent.runAgent }), /ignore|tracked|symlink/i);
    assert.deepEqual(await publishedArtifacts(root), previous);
    assert.equal(agent.consolidations.length, 0);
    if (scenario !== 'symlink') await assert.rejects(stat(join(root, '.comment-to-code/findings')), { code: 'ENOENT' });
  });
});

test('an invalid last finding rejects the entire batch before creating checkpoints', async t => {
  const { root, identify } = await checkout(t);
  const options = { cwd: root, identify, stdout: output };
  await main(['run', '--agent', 'omp'], { ...options, capture: async () => evidence() });
  const previous = await publishedArtifacts(root);
  await main(['capture'], { ...options, capture: async () => reviewedHistory([16]) });
  const agent = fixtureAgent();
  await assert.rejects(main(['analyze', '--agent', 'omp'], {
    ...options,
    runAgent: async (...args) => {
      const response = JSON.parse(await agent.runAgent(...args));
      response.findings.at(-1).codeEvidence[0].quote = '+invented code';
      return JSON.stringify(response);
    },
  }), /fabricated|code evidence/i);
  assert.equal(agent.batches.length, 1);
  assert.equal(agent.consolidations.length, 0);
  await assert.rejects(stat(join(root, '.comment-to-code/findings')), { code: 'ENOENT' });
  assert.deepEqual(await publishedArtifacts(root), previous);
});
