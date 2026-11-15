import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, installSkills } from '../src/install.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);

async function project(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'ctc-install-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

test('installs discoverable skills for all agents and is idempotent', async t => {
  const cwd = await project(t);
  const { files } = await installSkills(cwd);
  assert.deepEqual(files.map(file => file.slice(cwd.length + 1)), ['.omp/skills/comment-to-code/SKILL.md', '.claude/skills/comment-to-code/SKILL.md', '.agents/skills/comment-to-code/SKILL.md']);
  const first = await Promise.all(files.map(file => readFile(file, 'utf8')));
  for (const body of first) { assert.match(body, /^---\nname: comment-to-code/); assert.match(body, /comment-to-code analyze/); }
  await installSkills(cwd);
  assert.deepEqual(await Promise.all(files.map(file => readFile(file, 'utf8'))), first);
});

test('preflights all targets and preserves unmanaged or modified skills', async t => {
  const cwd = await project(t);
  const target = join(cwd, '.claude/skills/comment-to-code');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'SKILL.md'), 'user content');
  await assert.rejects(installSkills(cwd), /unmanaged or modified/);
  assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'user content');
  await assert.rejects(readFile(join(cwd, '.omp/skills/comment-to-code/SKILL.md')), { code: 'ENOENT' });
});

test('rejects target symlinks and every symlink ancestor, including project root', async t => {
  const cwd = await project(t);
  const outside = await project(t);
  await symlink(outside, join(cwd, '.agents'));
  await assert.rejects(installSkills(cwd, 'codex'), /symlink/);
  const alias = join(cwd, 'alias');
  await symlink(outside, alias);
  await assert.rejects(installSkills(alias, 'omp'), /symlink/);
  await mkdir(join(cwd, '.omp/skills/comment-to-code'), { recursive: true });
  const file = join(cwd, '.omp/skills/comment-to-code/SKILL.md');
  await writeFile(join(outside, 'existing'), 'private');
  await symlink(join(outside, 'existing'), file);
  await assert.rejects(installSkills(cwd, 'omp'), /symlink/);
  assert.equal(await readFile(join(outside, 'existing'), 'utf8'), 'private');
});

test('atomic replacement preserves prior artifact when a target is unsafe', async t => {
  const cwd = await project(t);
  const file = join(cwd, 'capture.json');
  await atomicWrite(file, 'first');
  await atomicWrite(file, 'second');
  assert.equal(await readFile(file, 'utf8'), 'second');
  await symlink(file, join(cwd, 'alias.json'));
  await assert.rejects(atomicWrite(join(cwd, 'alias.json'), 'third'), /symlink/);
  assert.equal(await readFile(file, 'utf8'), 'second');
});

test('npm global installation exposes working executable without install scripts', async t => {
  const prefix = await project(t);
  const source = fileURLToPath(new URL('../', import.meta.url));
  await exec('npm', ['install', '--global', '--ignore-scripts', '--prefix', prefix, source], { timeout: 30000, maxBuffer: 1024 * 1024 });
  const { stdout } = await exec(join(prefix, 'bin/comment-to-code'), ['--help'], { cwd: prefix });
  assert.match(stdout, /comment-to-code 0\.1\.0/);
});

test('install.sh runs local global npm installation using a user prefix', async t => {
  const prefix = await project(t);
  const script = fileURLToPath(new URL('../install.sh', import.meta.url));
  const { stdout } = await exec('sh', [script], { cwd: prefix, env: { ...process.env, npm_config_prefix: prefix }, timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.match(stdout, /Installed comment-to-code/);
  assert.match((await exec(join(prefix, 'bin/comment-to-code'), ['--version'])).stdout, /^0\.1\.0\n$/);
});
