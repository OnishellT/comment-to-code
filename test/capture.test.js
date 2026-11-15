import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { captureProject, identifyProject } from '../src/capture.js';

const exec = promisify(execFile);
let directory;
let cwd;
const repository = { owner: 'acme', name: 'widget', host: 'git.example.test', url: 'https://git.example.test/acme/widget' };
const timestamp = '2026-01-01T00:00:00Z';
const patch = { filename: 'src/main.js', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+fixed' };

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'comment-to-code-capture-'));
  cwd = join(directory, 'checkout');
  await mkdir(join(cwd, 'nested'), { recursive: true });
  await exec('git', ['init', '-q', cwd]);
  await exec('git', ['-C', cwd, 'remote', 'add', 'origin', 'git@git.example.test:acme/widget.git']);
});
after(async () => rm(directory, { recursive: true, force: true }));

function pull(number = 1, overrides = {}) {
  return {
    number, title: `PR ${number}`, body: 'PR body', html_url: `${repository.url}/pull/${number}`,
    state: 'open', merged_at: null, base: { sha: 'base' }, head: { sha: 'head' },
    comments: 0, review_comments: 0, commits: 0, changed_files: 0,
    created_at: timestamp, updated_at: timestamp, closed_at: null, user: { login: 'author' }, draft: false,
    ...overrides,
  };
}

function discussion(id, overrides = {}) {
  return { id, body: `Comment ${id}`, html_url: `${repository.url}/issues/1#issuecomment-${id}`, user: { login: 'reviewer' }, created_at: timestamp, updated_at: timestamp, ...overrides };
}
function inline(id, overrides = {}) {
  return discussion(id, { path: 'src/main.js', line: 1, original_line: 1, original_commit_id: 'reviewed', commit_id: 'reviewed', diff_hunk: patch.patch, ...overrides });
}
function commit(index) {
  return { sha: `sha${index}`, commit: { message: `Commit ${index}`, author: { date: timestamp } } };
}
function encoded(content) {
  return { type: 'file', encoding: 'base64', size: Buffer.byteLength(content), content: Buffer.from(content).toString('base64') };
}

function fixture({ pulls = [pull()], discussions = [], reviews = [], inlines = [], commits = [], files = [], commitFiles = [patch], contents = () => encoded('source\n'), override } = {}) {
  const calls = [];
  const runGh = async (args, options) => {
    calls.push({ args, options });
    assert.equal(options.cwd, cwd);
    if (args[0] === 'repo') {
      assert.deepEqual(args, ['repo', 'view', 'git.example.test/acme/widget', '--json', 'name,owner,url']);
      return JSON.stringify({ name: repository.name, owner: { login: repository.owner }, url: repository.url });
    }
    assert.equal(args[0], 'api');
    assert.equal(args[args.indexOf('--hostname') + 1], repository.host);
    const url = new URL(args.at(-1), 'https://fixture.test/');
    const page = Number(url.searchParams.get('page'));
    const rows = values => {
      assert.equal(url.searchParams.get('per_page'), '100');
      assert.ok(page >= 1);
      return values.slice((page - 1) * 100, page * 100);
    };
    if (override) {
      const result = override(url, { rows });
      if (result !== undefined) return JSON.stringify(result);
    }
    let result;
    if (url.pathname === '/repos/acme/widget/pulls') {
      assert.equal(url.searchParams.get('state'), 'all');
      result = rows(pulls);
    } else if (/\/pulls\/\d+$/.test(url.pathname)) {
      result = pulls.find(item => item.number === Number(url.pathname.split('/').at(-1)));
    } else if (/\/issues\/\d+\/comments$/.test(url.pathname)) result = rows(discussions);
    else if (/\/pulls\/\d+\/reviews$/.test(url.pathname)) result = rows(reviews);
    else if (/\/pulls\/\d+\/comments$/.test(url.pathname)) result = rows(inlines);
    else if (/\/pulls\/\d+\/commits$/.test(url.pathname)) result = rows(commits);
    else if (/\/pulls\/\d+\/files$/.test(url.pathname)) result = rows(files);
    else if (/\/commits\/[^/]+$/.test(url.pathname)) result = { files: rows(typeof commitFiles === 'function' ? commitFiles(url.pathname.split('/').at(-1)) : commitFiles) };
    else if (url.pathname.includes('/contents/')) result = contents(url);
    else throw new Error(`Unexpected fixture request: ${url}`);
    return JSON.stringify(result);
  };
  return { runGh, calls };
}

test('identifies the actual checkout from a nested folder and explicit enterprise remote', async () => {
  const { runGh } = fixture();
  const project = await identifyProject({ cwd: join(cwd, 'nested'), runGh });
  assert.deepEqual(project, { cwd, repository });
});

test('rejects non-checkouts, local remotes, inaccessible hosts, and mismatched gh identity', async () => {
  await assert.rejects(identifyProject({ cwd: directory, runGh: async () => assert.fail('must not call gh') }), /Cannot identify the Git checkout/);
  const other = join(directory, 'other');
  await exec('git', ['init', '-q', other]);
  await exec('git', ['-C', other, 'remote', 'add', 'origin', '/tmp/local-repository']);
  await assert.rejects(identifyProject({ cwd: other, runGh: async () => assert.fail('must not call gh') }), /remote must be a GitHub/);
  await assert.rejects(identifyProject({ cwd, runGh: async () => { throw new Error('HTTP 401'); } }), /gh auth login --hostname git.example.test/);
  await assert.rejects(identifyProject({ cwd, runGh: async () => JSON.stringify({ name: 'wrong', owner: { login: 'wrong' }, url: 'https://github.com/wrong/wrong' }) }), /outside the checkout remote host/);
});

test('production gh subprocess ignores GH_REPO and GH_HOST and uses argument arrays', async () => {
  const bin = join(directory, 'bin');
  await mkdir(bin);
  const script = join(bin, 'gh');
  await writeFile(script, `#!${process.execPath}\nif ('GH_REPO' in process.env || 'GH_HOST' in process.env) process.exit(9);\nif (process.argv[4] !== 'git.example.test/acme/widget') process.exit(10);\nconsole.log(JSON.stringify({name:'widget',owner:{login:'acme'},url:'https://git.example.test/acme/widget'}));\n`);
  await chmod(script, 0o755);
  const moduleUrl = pathToFileURL(resolve('src/capture.js')).href;
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', `import {identifyProject} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await identifyProject({cwd:${JSON.stringify(cwd)}})));`], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_REPO: 'other/repository', GH_HOST: 'other.example.test' },
  });
  assert.deepEqual(JSON.parse(stdout), { cwd, repository });
});

test('paginates PRs beyond one full page and preserves all lifecycle states', async () => {
  const pulls = Array.from({ length: 101 }, (_, index) => pull(index + 1, {
    state: index % 3 === 0 ? 'open' : 'closed', merged_at: index % 3 === 2 ? timestamp : null,
  }));
  const { runGh, calls } = fixture({ pulls });
  const capture = await captureProject({ cwd, runGh });
  assert.equal(capture.version, 1);
  assert.deepEqual(capture.repository, repository);
  assert.equal(capture.pullRequests.length, 101);
  assert.deepEqual(capture.pullRequests.map(pr => [pr.number, pr.state, pr.mergedAt]), pulls.map(pr => [pr.number, pr.state, pr.merged_at]));
  assert.ok(calls.some(call => call.args.at(-1).includes('pulls?state=all&sort=created&direction=asc&per_page=100&page=2')));
});

test('paginates every comment, commit, and file endpoint and preserves empty reviews and replies', async () => {
  const discussions = Array.from({ length: 101 }, (_, i) => discussion(i + 1));
  const reviews = Array.from({ length: 101 }, (_, i) => discussion(i + 1, { body: i === 0 ? '' : `Review ${i}`, created_at: undefined, updated_at: undefined, submitted_at: timestamp }));
  const inlines = Array.from({ length: 101 }, (_, i) => inline(i + 1, i ? { in_reply_to_id: i } : {}));
  // Replies may precede their root in API ordering.
  inlines.reverse();
  const commits = Array.from({ length: 101 }, (_, i) => commit(i));
  const files = Array.from({ length: 101 }, (_, i) => ({ ...patch, filename: `src/file-${i}.js`, ...(i === 0 ? { previous_filename: 'old.js', status: 'renamed' } : {}) }));
  const { runGh, calls } = fixture({
    pulls: [pull(1, { comments: 101, review_comments: 101, commits: 101, changed_files: 101 })],
    discussions, reviews, inlines, commits, files,
    commitFiles: sha => sha === 'sha0' ? files : [patch],
    contents: url => encoded(url.searchParams.get('ref') === 'reviewed' ? 'old\n' : 'fixed\n'),
  });
  const capture = await captureProject({ cwd, runGh });
  const pr = capture.pullRequests[0];
  assert.equal(pr.comments.length, 303);
  assert.equal(new Set(pr.comments.map(item => item.id)).size, 303);
  assert.deepEqual(pr.comments.filter(item => item.kind === 'discussion').map(item => item.body), discussions.map(item => item.body));
  assert.deepEqual(pr.comments.filter(item => item.kind === 'review').map(item => item.body), reviews.map(item => item.body));
  assert.deepEqual(pr.comments.filter(item => item.kind === 'inline').map(item => item.body), inlines.map(item => item.body));
  assert.ok(pr.comments.filter(item => item.kind === 'inline').every(item => item.threadId === 'inline:1'));
  assert.equal(pr.comments.find(item => item.id === 'review:1').createdAt, timestamp);
  assert.equal(pr.comments.find(item => item.id === 'inline:1').diffHunk, patch.patch);
  assert.equal(pr.commits.length, 101);
  assert.equal(pr.commits[0].files.length, 101);
  assert.equal(pr.commits[0].files[0].patch, patch.patch);
  assert.equal(pr.files.length, 101);
  assert.equal(pr.files[0].previousPath, 'old.js');
  assert.deepEqual(pr.sources, [
    { path: 'src/main.js', ref: 'reviewed', content: 'old\n', unavailableReason: null },
    { path: 'src/main.js', ref: 'head', content: 'fixed\n', unavailableReason: null },
  ]);
  assert.deepEqual(pr.limitations, []);
  for (const suffix of ['issues/1/comments', 'pulls/1/reviews', 'pulls/1/comments', 'pulls/1/commits', 'pulls/1/files', 'commits/sha0']) {
    assert.ok(calls.some(call => call.args.at(-1).endsWith(`${suffix}?per_page=100&page=2`)), `missing page 2: ${suffix}`);
  }
});

test('fetches the terminal empty page for exact full pages', async () => {
  const discussions = Array.from({ length: 100 }, (_, i) => discussion(i));
  const { runGh, calls } = fixture({ pulls: [pull(1, { comments: 100 })], discussions });
  const capture = await captureProject({ cwd, runGh });
  assert.equal(capture.pullRequests[0].comments.length, 100);
  assert.ok(calls.some(call => call.args.at(-1).endsWith('issues/1/comments?per_page=100&page=2')));
});

test('marks missing, binary, large, invalid, and truncated source unavailable without losing comments', async () => {
  const paths = ['deleted.js', 'binary.js', 'large.js', 'truncated.js', 'invalid.js', 'non-utf8.js', 'submodule', 'empty.js', 'odd #?.js'];
  const inlines = paths.map((path, index) => inline(index + 1, { path }));
  const { runGh } = fixture({
    pulls: [pull(1, { review_comments: inlines.length })], inlines,
    contents: url => {
      const path = decodeURIComponent(url.pathname.split('/contents/')[1]);
      if (path === 'deleted.js') throw new Error('gh: Not Found (HTTP 404)');
      if (path === 'binary.js') return encoded('binary\0data');
      if (path === 'large.js') return { type: 'file', encoding: 'none', size: 2000000, content: '' };
      if (path === 'truncated.js') return { ...encoded('short'), size: 100 };
      if (path === 'invalid.js') return { type: 'file', encoding: 'base64', size: 1, content: '???' };
      if (path === 'non-utf8.js') return { type: 'file', encoding: 'base64', size: 1, content: '/w==' };
      if (path === 'submodule') return { type: 'file', submodule_git_url: 'https://example.test/submodule' };
      return encoded(path === 'empty.js' ? '' : 'preserved source\n');
    },
  });
  const pr = (await captureProject({ cwd, runGh })).pullRequests[0];
  assert.equal(pr.comments.length, paths.length);
  assert.equal(pr.sources.length, paths.length * 2);
  for (const item of pr.sources) {
    if (item.path === 'empty.js') assert.equal(item.content, '');
    else if (item.path === 'odd #?.js') assert.equal(item.content, 'preserved source\n');
    else {
      assert.equal(item.content, null);
      assert.ok(item.unavailableReason);
    }
  }
});

test('marks absent and truncated patches unavailable in final and per-commit evidence', async () => {
  const files = [
    { ...patch, filename: 'binary', patch: undefined },
    { ...patch, filename: 'truncated', patch: '@@ -1 +1 @@\n-old' },
    { ...patch, filename: 'missing-hunk', additions: 2, patch: patch.patch },
    { ...patch, filename: 'deleted', status: 'removed', additions: 0, deletions: 1, patch: '@@ -1 +0,0 @@\n-old\n\\ No newline at end of file' },
  ];
  const { runGh } = fixture({ pulls: [pull(1, { changed_files: 4, commits: 1 })], files, commits: [commit(1)], commitFiles: files });
  const pr = (await captureProject({ cwd, runGh })).pullRequests[0];
  assert.deepEqual(pr.files.map(file => file.patch), [null, null, null, files[3].patch]);
  assert.equal(pr.limitations.length, 3);
  assert.equal(pr.commits[0].limitations.length, 3);
});

test('preserves orphan reply thread identity with an explicit context limitation', async () => {
  const { runGh } = fixture({ pulls: [pull(1, { review_comments: 1 })], inlines: [inline(2, { in_reply_to_id: 1 })] });
  const pr = (await captureProject({ cwd, runGh })).pullRequests[0];
  assert.equal(pr.comments[0].threadId, 'inline:1');
  assert.match(pr.limitations[0], /unavailable parent comment 1/);
});

test('fails API errors, malformed pages, repeated pages, and missing items explicitly', async () => {
  const base = fixture();
  await assert.rejects(captureProject({ cwd, runGh: async (args, options) => {
    if (args[0] === 'api') throw new Error('HTTP 403 rate limit exceeded');
    return base.runGh(args, options);
  } }), /rate limit exceeded.*gh auth status/);
  await assert.rejects(captureProject({ cwd, runGh: async (args, options) => args[0] === 'api' ? 'invalid JSON' : base.runGh(args, options) }), /invalid JSON/);
  await assert.rejects(captureProject({ cwd, runGh: fixture({ override: url => url.pathname.endsWith('/pulls') ? { message: 'truncated' } : undefined }).runGh }), /malformed paginated response/);
  const page = Array.from({ length: 100 }, (_, i) => pull(i + 1));
  await assert.rejects(captureProject({ cwd, runGh: fixture({ override: url => url.pathname.endsWith('/pulls') ? page : undefined }).runGh }), /Repeated or missing item identity/);
  await assert.rejects(captureProject({ cwd, runGh: fixture({ pulls: [pull(1, { comments: 1 })] }).runGh }), /Incomplete discussion comments/);
  await assert.rejects(captureProject({ cwd, runGh: fixture({ pulls: [pull(1, { commits: 1 })] }).runGh }), /Incomplete commits/);
  await assert.rejects(captureProject({ cwd, runGh: fixture({ pulls: [pull(1, { changed_files: 1 })] }).runGh }), /Incomplete files/);
});

test('rejects a PR snapshot changed during capture even when commit and file counts match', async () => {
  const initial = pull(1, { commits: 1, changed_files: 1, head: { sha: 'sha1' } });
  for (const change of [
    { head: { sha: 'sha2' } },
    { base: { sha: 'new-base' } },
    { comments: 1 },
    { updated_at: '2026-01-02T00:00:00Z' },
    { state: 'closed', merged_at: '2026-01-02T00:00:00Z' },
  ]) {
    let detailReads = 0;
    const { runGh } = fixture({
      pulls: [initial], commits: [commit(2)], files: [patch],
      override: url => url.pathname === '/repos/acme/widget/pulls/1' ? (detailReads++ ? { ...initial, ...change } : initial) : undefined,
    });
    await assert.rejects(captureProject({ cwd, runGh }), /PR #1 changed during capture.*retry/);
  }
});

test('source authorization failures abort rather than disguising authentication as missing code', async () => {
  const { runGh } = fixture({ pulls: [pull(1, { review_comments: 1 })], inlines: [inline(1)], contents: () => { throw new Error('HTTP 403 forbidden'); } });
  await assert.rejects(captureProject({ cwd, runGh }), /HTTP 403 forbidden/);
});

test('rejects documented PR commit, PR file, and commit-file caps explicitly', async () => {
  for (const [overrides, pattern] of [
    [{ commits: 251 }, /250-commit/], [{ changed_files: 3001 }, /3000-file/],
  ]) {
    await assert.rejects(captureProject({ cwd, runGh: fixture({ pulls: [pull(1, overrides)] }).runGh }), pattern);
  }
  const files = Array.from({ length: 3000 }, (_, i) => ({ ...patch, filename: `file${i}` }));
  const { runGh } = fixture({ pulls: [pull(1, { commits: 1 })], commits: [commit(1)], commitFiles: files });
  await assert.rejects(captureProject({ cwd, runGh }), /3000-item API limit.*commits\/sha1/);
});

test('preserves pending and dismissed review context without inventing timestamps', async () => {
  const reviews = [
    discussion(1, { state: 'PENDING', body: '', created_at: undefined, updated_at: undefined, commit_id: 'reviewed' }),
    discussion(2, { state: 'DISMISSED', body: 'Earlier feedback', submitted_at: timestamp, commit_id: 'earlier' }),
  ];
  const { runGh } = fixture({ reviews });
  const pr = (await captureProject({ cwd, runGh })).pullRequests[0];
  assert.equal(pr.comments[0].body, '');
  assert.equal(pr.comments[0].createdAt, null);
  assert.equal(pr.comments[0].updatedAt, null);
  assert.equal(pr.comments[0].reviewState, 'PENDING');
  assert.equal(pr.comments[0].originalCommitId, 'reviewed');
  assert.equal(pr.comments[1].reviewState, 'DISMISSED');
  assert.match(pr.limitations[0], /no submission timestamp/);
});

test('preserves BOM and large complete UTF-8 source byte-for-byte', async () => {
  const text = '\uFEFF' + 'x'.repeat(1024 * 1024 - 3);
  const { runGh } = fixture({
    pulls: [pull(1, { review_comments: 1 })], inlines: [inline(1)],
    contents: () => encoded(text),
  });
  const pr = (await captureProject({ cwd, runGh })).pullRequests[0];
  for (const source of pr.sources) {
    assert.equal(source.content, text);
    assert.equal(source.unavailableReason, null);
  }
});
