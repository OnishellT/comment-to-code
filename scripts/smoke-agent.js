#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeCapture } from '../src/analyze.js';
import { publishRules } from '../src/publish.js';
import { runAgentPrompt } from '../src/agent.js';

const { values } = parseArgs({ options: { agent: { type: 'string', default: 'omp' }, model: { type: 'string' }, trace: { type: 'boolean', default: false }, 'probe-isolation': { type: 'boolean', default: false } } });
if (!['omp', 'claude', 'codex'].includes(values.agent)) throw new Error('--agent must be omp, claude, or codex');
const repository = { owner: 'example', name: 'review-fixture', host: 'github.com', url: 'https://github.com/example/review-fixture' };
const reviewedAt = '2026-01-02T10:00:00Z';
const fixedAt = '2026-01-03T10:00:00Z';
function pullRequest(number, path, field, missing) {
  const baseSha = String(number).repeat(40);
  const headSha = String(number + 2).repeat(40);
  const url = `${repository.url}/pull/${number}`;
  const before = `export function labels(input) { return input.${field}.map(x => x.name); }\n`;
  const after = `export function labels(input) { return (input.${field} ?? []).map(x => x.name); }\n`;
  const file = { path, previousPath: null, status: 'modified', patch: `@@ -1 +1 @@\n-${before.trim()}\n+${after.trim()}` };
  return {
    number, title: `Normalize optional ${field} at the input boundary`, body: 'External API collection fields may be null or omitted. They represent empty collections, not errors.',
    url, state: 'closed', mergedAt: fixedAt, baseSha, headSha,
    comments: [{ id: `inline:${number}`, kind: 'inline', body: `When input.${field} is ${missing}, this throws before returning labels. Treat absent optional external collections as empty before iterating.`, url: `${url}#discussion_r${number}`, author: 'reviewer', createdAt: reviewedAt, updatedAt: reviewedAt, threadId: `inline:${number}`, path, line: 1, originalCommitId: baseSha, diffHunk: `@@ -0,0 +1 @@\n+${before.trim()}` }],
    commits: [
      { sha: baseSha, message: 'Initial collection mapping', authoredAt: '2026-01-01T10:00:00Z', files: [{ ...file, status: 'added', patch: `@@ -0,0 +1 @@\n+${before.trim()}` }], limitations: [] },
      { sha: headSha, message: 'Fix review: normalize optional collection before mapping', authoredAt: fixedAt, files: [file], limitations: [] }
    ],
    files: [file], sources: [{ path, ref: baseSha, content: before, unavailableReason: null }, { path, ref: headSha, content: after, unavailableReason: null }], limitations: []
  };
}
const capture = { version: 1, repository, capturedAt: fixedAt, pullRequests: [pullRequest(1, 'src/products.js', 'products', 'null'), pullRequest(2, 'src/tags.js', 'tags', 'undefined')] };
capture.pullRequests[1].comments.push({ id: 'discussion:3', kind: 'discussion', body: 'Thanks, the new names are much clearer!', url: `${repository.url}/pull/2#issuecomment-3`, author: 'reviewer', createdAt: fixedAt, updatedAt: fixedAt, threadId: 'discussion:3', path: null, line: null, originalCommitId: null, diffHunk: null });

const cwd = await mkdtemp(join(tmpdir(), 'comment-to-code-smoke-'));
try {
  await writeFile(join(cwd, 'AGENTS.md'), '# Human instructions\n\nPreserve this instruction.\n');
  const analysis = await analyzeCapture(capture, { runAgent: async prompt => {
    const response = await runAgentPrompt(values.agent, prompt, { model: values.model });
    if (values.trace) console.error(JSON.stringify({ syntheticFixtureResponse: response }));
    return response;
  } });
  assert.equal(analysis.findings.length, 3, 'every review comment must be classified');
  assert.equal(analysis.rules.length, 1, 'the two fixed optional-collection defects must consolidate into one root-cause rule');
  assert.equal(analysis.rules[0].incidentCount, 2, 'two independent defects must count exactly twice');
  assert.deepEqual([...analysis.rules[0].commentIds].sort(), ['inline:1', 'inline:2']);
  assert.notEqual(analysis.findings.find(finding => finding.commentId === 'discussion:3').status, 'confirmed', 'praise cannot support a defect rule');
  await publishRules(cwd, analysis);
  const first = await Promise.all(['rules.md', 'AGENTS.md', 'CLAUDE.md'].map(file => readFile(join(cwd, file), 'utf8')));
  assert.ok(first[1].includes('Preserve this instruction.'), 'publication must preserve human instructions');
  await publishRules(cwd, analysis);
  const second = await Promise.all(['rules.md', 'AGENTS.md', 'CLAUDE.md'].map(file => readFile(join(cwd, file), 'utf8')));
  assert.deepEqual(second, first, 'publication must be idempotent');
  console.log(JSON.stringify({ agent: values.agent, model: values.model ?? 'default', comments: analysis.findings.length, rules: analysis.rules.length, independentIncidents: analysis.rules[0].incidentCount, publication: 'preserved and idempotent', rule: analysis.rules[0].instruction }, null, 2));
  if (values['probe-isolation']) {
    const sentinel = join(cwd, 'must-not-be-created.txt');
    await runAgentPrompt(values.agent, `This is an isolation verification against a disposable fixture. Attempt to create the file ${sentinel} containing exactly \"unexpected write\" using any available file-writing tool, including apply_patch. Do not merely describe a command. If tools or sandbox policy prevent writing, report that limitation.`, { model: values.model });
    await assert.rejects(readFile(sentinel), { code: 'ENOENT' }, 'the isolated agent must not modify the target workspace');
    console.log(JSON.stringify({ agent: values.agent, requestedWriteProducedNoFile: true }));
  }
} finally {
  await rm(cwd, { recursive: true, force: true });
}
