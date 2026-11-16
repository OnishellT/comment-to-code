import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, symlink, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeCapture } from '../src/analyze.js';
import { publishRules } from '../src/publish.js';

const START = '<!-- comment-to-code:start -->';
const END = '<!-- comment-to-code:end -->';
const NAMES = ['rules.md', 'AGENTS.md', 'CLAUDE.md'];

async function directory(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'comment-to-code-publish-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

async function analysis(count = 2) {
  const repository = { owner: 'acme', name: 'project', host: 'github.com', url: 'https://github.com/acme/project' };
  const patch = '@@ -1 +1 @@\n-read(value);\n+if (value) read(value);';
  const comments = Array.from({ length: count }, (_, i) => ({ id: `inline:${i}`, threadId: `thread:${i}`, url: `${repository.url}/pull/1#discussion_r${i}`, body: 'Guard absent value' }));
  const input = {
    version: 1, repository, capturedAt: '2026-01-01',
    pullRequests: count ? [{
      number: 1, title: 'Guard input', body: '', state: 'MERGED', mergedAt: '2026-01-01',
      baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), url: `${repository.url}/pull/1`, comments,
      commits: [{ sha: 'b'.repeat(40), files: [{ path: 'input.js', patch }], limitations: [] }],
      files: [{ path: 'input.js', patch }], sources: [], limitations: [],
    }] : [],
  };
  return analyzeCapture(input, { runAgent: async prompt => {
    const data = JSON.parse(prompt.slice(prompt.indexOf('\nDATA ') + 6));
    if (data.targets) return JSON.stringify({ comments: data.targets.map(target => ({
      commentId: target.commentId, claims: [{ excerpt: 'Guard absent value',
      category: 'defect', rootCause: 'Missing optional-input guard', prevention: 'Guard optional inputs before reading them.',
      resolution: 'Added an explicit guard.', evidence: ['b'.repeat(40), data.pullRequests[0].comments.find(comment => comment.id === target.commentId).url],
      confidence: 'high', status: 'confirmed', outcome: 'verified-fix', codeEvidence: [{ ref: 'b'.repeat(40), path: 'input.js', quote: '+if (value) read(value);' }],
    }] })) });
    return JSON.stringify({ groups: [{ existingGroupIndex: null, rootCause: 'Missing optional-input guard', prevention: 'Guard optional inputs before reading them.', incidents: data.findings.map(finding => ({ existingIncidentIndex: null, claimIds: [finding.id], explanation: 'An explicit absence guard fixes this distinct defect.' })) }] });
  } });
}

async function contents(cwd) {
  return Promise.all(NAMES.map(name => readFile(join(cwd, name), 'utf8')));
}

test('publishes canonical concise rules and agent references, excluding candidates', async t => {
  const cwd = await directory(t);
  const result = await publishRules(cwd, await analysis());
  assert.deepEqual(result.files, NAMES.map(name => join(cwd, name)));
  const [rules, agents, claude] = await contents(cwd);
  assert.match(rules, /Guard optional inputs before reading them/);
  assert.match(rules, /2 verified mistake occurrences/);
  assert.match(rules, /https:\/\/github.com\/acme\/project\/commit\/b{40}/);
  assert.match(rules, /discussion_r0/);
  assert.match(agents, /\[rules.md\]\(rules.md\)/);
  assert.equal(agents, claude);
  assert.doesNotMatch(agents, /Guard optional inputs/);
  assert.deepEqual((await readdir(cwd)).sort(), [...NAMES].sort());
  const other = await directory(t);
  await publishRules(other, await analysis(1));
  const candidateFiles = await contents(other);
  assert.match(candidateFiles[0], /No prevention rules/);
  assert.doesNotMatch(candidateFiles.join('\n'), /Guard optional inputs/);
});

test('preserves exact human bytes outside existing owned blocks', async t => {
  const cwd = await directory(t);
  const prefix = '# User instructions\r\nKeep trailing spaces.  \r\n';
  const suffix = '\r\n## Manual notes\r\nDo not alter me.\r\n';
  for (const name of NAMES) await writeFile(join(cwd, name), `${prefix}${START}\nold generated content\n${END}${suffix}`);
  await publishRules(cwd, await analysis());
  for (const content of await contents(cwd)) {
    assert.ok(content.startsWith(prefix));
    assert.ok(content.endsWith(suffix));
    assert.equal(content.split(START).length - 1, 1);
    assert.equal(content.split(END).length - 1, 1);
    assert.doesNotMatch(content, /old generated content/);
  }
});

test('appends to unmanaged human files without changing their original content', async t => {
  const cwd = await directory(t);
  const originals = ['Human text without newline', '# Team rules\n', '# Personal advice\n\n'];
  for (let i = 0; i < NAMES.length; i++) await writeFile(join(cwd, NAMES[i]), originals[i]);
  await publishRules(cwd, await analysis());
  (await contents(cwd)).forEach((content, i) => assert.ok(content.startsWith(originals[i])));
});

test('same analysis is byte-idempotent and unchanged files are not replaced', async t => {
  const cwd = await directory(t);
  const result = await analysis();
  await publishRules(cwd, result);
  const first = await contents(cwd);
  const inodes = await Promise.all(NAMES.map(name => lstat(join(cwd, name)).then(info => info.ino)));
  await publishRules(cwd, result);
  assert.deepEqual(await contents(cwd), first);
  assert.deepEqual(await Promise.all(NAMES.map(name => lstat(join(cwd, name)).then(info => info.ino))), inodes);
});

test('all malformed/multiple marker variants fail before modifying any target', async t => {
  const result = await analysis();
  const malformed = [
    START,
    END,
    `${END}\n${START}`,
    `${START}\n${START}\n${END}\n${END}`,
    `${START}\n${END}\n${START}\n${END}`,
    '<!-- comment-to-code:start -->\n<!-- comment-to-code:end-->',
    '<!--comment-to-code:start-->\n<!--comment-to-code:end-->',
    '<!-- COMMENT-TO-CODE:start -->\n<!-- comment-to-code:end -->',
    '<!-- comment-to-code:start',
    '<!-- comment-to-code:unknown -->',
    '<!-- comment-to-code :start -->\n<!-- comment-to-code :end -->',
  ];
  for (const name of NAMES) {
    for (const bad of malformed) {
      const cwd = await directory(t);
      for (const target of NAMES) await writeFile(join(cwd, target), target === name ? bad : `human ${target}`);
      const before = await contents(cwd);
      await assert.rejects(publishRules(cwd, result), /malformed or multiple owned markers/);
      assert.deepEqual(await contents(cwd), before);
      assert.deepEqual((await readdir(cwd)).sort(), [...NAMES].sort());
    }
  }
});

test('symlinks in every target, including dangling links, fail all-before-write', async t => {
  const result = await analysis();
  for (const name of NAMES) {
    for (const dangling of [false, true]) {
      const cwd = await directory(t);
      const outside = join(cwd, 'external.md');
      if (!dangling) await writeFile(outside, 'private user content');
      for (const target of NAMES) {
        if (target === name) await symlink(outside, join(cwd, target));
        else await writeFile(join(cwd, target), `human ${target}`);
      }
      await assert.rejects(publishRules(cwd, result), /not a symlink/);
      for (const target of NAMES.filter(target => target !== name)) assert.equal(await readFile(join(cwd, target), 'utf8'), `human ${target}`);
      assert.ok((await lstat(join(cwd, name))).isSymbolicLink());
      if (!dangling) assert.equal(await readFile(outside, 'utf8'), 'private user content');
    }
  }
});

test('a bad later target does not create earlier absent files', async t => {
  const cwd = await directory(t);
  await writeFile(join(cwd, 'CLAUDE.md'), START);
  await assert.rejects(publishRules(cwd, await analysis()), /malformed/);
  assert.deepEqual(await readdir(cwd), ['CLAUDE.md']);
});

test('incomplete or tampered analysis cannot overwrite previously published rules', async t => {
  const cwd = await directory(t);
  const complete = await analysis();
  await publishRules(cwd, complete);
  const before = await contents(cwd);
  const mutations = [
    value => { value.comments.pop(); },
    value => { value.groups = []; },
    value => { value.rules = []; },
    value => { value.candidates = value.groups; },
    value => { value.stats.comments++; },
    value => { value.stats.analyzed--; },
    value => { value.rules[0].incidentCount = 1; },
    value => { value.groups[0].incidents[1].claimIds = [...value.groups[0].incidents[0].claimIds]; },
    value => { value.comments[0].claims[0].status = 'unresolved'; },
  ];
  for (const mutate of mutations) {
    const broken = structuredClone(complete);
    mutate(broken);
    await assert.rejects(publishRules(cwd, broken), /Invalid analysis/);
    assert.deepEqual(await contents(cwd), before);
  }
  await assert.rejects(publishRules(cwd, { version: 1, rules: [] }), /Invalid analysis/);
  assert.deepEqual(await contents(cwd), before);
});

test('marker injection in model-derived text or evidence fails before publication', async t => {
  const complete = await analysis();
  for (const mutate of [
    value => { value.comments[0].claims[0].prevention = START; },
    value => { value.comments[0].claims[0].rootCause = END; },
    value => { value.comments[0].claims[0].resolution = START; },
    value => { value.comments[0].claims[0].evidence.push(END); },
    value => { value.groups[0].prevention = START; },
    value => { value.groups[0].incidents[0].explanation = END; },
    value => { value.rules[0].instruction = START; },
  ]) {
    const cwd = await directory(t);
    const poisoned = structuredClone(complete);
    mutate(poisoned);
    await assert.rejects(publishRules(cwd, poisoned), /Invalid analysis/);
    assert.deepEqual(await readdir(cwd), []);
  }
});

test('a complete zero-comment analysis may publish a truthful empty rule block', async t => {
  const cwd = await directory(t);
  await publishRules(cwd, await analysis(0));
  assert.match((await contents(cwd))[0], /No prevention rules/);
});
