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
function pullRequest(number, { path, title, body, before, after, comment }) {
  const baseSha = String(number).repeat(40);
  const headSha = String(number + 2).repeat(40);
  const url = `${repository.url}/pull/${number}`;
  const file = { path, previousPath: null, status: 'modified', patch: `@@ -1 +1 @@\n-${before.trim()}\n+${after.trim()}` };
  return {
    number, title, body,
    url, state: 'closed', mergedAt: fixedAt, baseSha, headSha,
    comments: [{ id: `inline:${number}`, kind: 'inline', body: comment, url: `${url}#discussion_r${number}`, author: 'reviewer', createdAt: reviewedAt, updatedAt: reviewedAt, threadId: `inline:${number}`, path, line: 1, originalCommitId: baseSha, diffHunk: `@@ -0,0 +1 @@\n+${before.trim()}` }],
    commits: [
      { sha: baseSha, message: 'Initial reviewed implementation', authoredAt: '2026-01-01T10:00:00Z', files: [{ ...file, status: 'added', patch: `@@ -0,0 +1 @@\n+${before.trim()}` }], limitations: [] },
      { sha: headSha, message: `Fix review: ${title}`, authoredAt: fixedAt, files: [file], limitations: [] }
    ],
    files: [file], sources: [{ path, ref: baseSha, content: before, unavailableReason: null }, { path, ref: headSha, content: after, unavailableReason: null }], limitations: []
  };
}
function optionalCollection(number, path, field, missing) {
  return pullRequest(number, {
    path, title: `Normalize optional ${field} at the input boundary`,
    body: 'External API collection fields may be null or omitted. They represent empty collections, not errors.',
    before: `export function labels(input) { return input.${field}.map(x => x.name); }\n`,
    after: `export function labels(input) { return (input.${field} ?? []).map(x => x.name); }\n`,
    comment: `When input.${field} is ${missing}, this throws before returning labels. Treat absent optional external collections as empty before iterating.`
  });
}
const capture = { version: 1, repository, capturedAt: fixedAt, pullRequests: [
  optionalCollection(1, 'src/products.js', 'products', 'null'),
  optionalCollection(2, 'src/tags.js', 'tags', 'undefined'),
  pullRequest(4, {
    path: 'db/recent-orders.sql', title: 'Index customer order history retrieval',
    body: 'The customer order-history endpoint must retrieve the newest twenty orders without scanning and sorting the whole orders table.',
    before: 'SELECT id FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20;\n',
    after: 'CREATE INDEX orders_customer_created_at_idx ON orders (customer_id, created_at DESC); SELECT id FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20;\n',
    comment: 'This query has no supporting index, so each customer history request scans the orders table and sorts the matches. Add a composite index on customer_id and created_at DESC so the access path supports both the equality filter and ordered limit.'
  }),
  pullRequest(5, {
    path: 'db/recent-events.sql', title: 'Index account event history retrieval',
    body: 'The account activity endpoint must retrieve the newest twenty events without scanning and sorting the whole events table.',
    before: 'SELECT id FROM events WHERE account_id = $1 ORDER BY occurred_at DESC LIMIT 20;\n',
    after: 'CREATE INDEX events_account_occurred_at_idx ON events (account_id, occurred_at DESC); SELECT id FROM events WHERE account_id = $1 ORDER BY occurred_at DESC LIMIT 20;\n',
    comment: 'Without a supporting index, each account activity request scans the events table and sorts the matches. Add a composite index on account_id and occurred_at DESC to serve the equality filter and ordered limit directly.'
  }),
  pullRequest(6, {
    path: 'db/invoices.sql', title: 'Retain invoices when an account deletion is attempted',
    body: 'Issued invoices are required billing records and must survive account deletion attempts.',
    before: 'CREATE TABLE invoices (id BIGINT PRIMARY KEY, account_id BIGINT REFERENCES accounts(id) ON DELETE CASCADE);\n',
    after: 'CREATE TABLE invoices (id BIGINT PRIMARY KEY, account_id BIGINT REFERENCES accounts(id) ON DELETE RESTRICT);\n',
    comment: 'ON DELETE CASCADE silently destroys required invoice history when the account is deleted. Use ON DELETE RESTRICT on this foreign key so account deletion is refused while invoices still reference it.'
  }),
  pullRequest(7, {
    path: 'db/migrations/subscription-lifecycle.sql', title: 'Backfill subscription lifecycle during migration',
    body: 'Existing subscriptions with ended_at set must remain ended when the new lifecycle field is introduced.',
    before: "ALTER TABLE subscriptions ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active';\n",
    after: "ALTER TABLE subscriptions ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active'; UPDATE subscriptions SET lifecycle = 'ended' WHERE ended_at IS NOT NULL;\n",
    comment: 'The default marks already-ended subscriptions active after rollout. Backfill lifecycle from the existing ended_at state in this migration so historical ended subscriptions are not reactivated.'
  })
] };
capture.pullRequests[1].comments.push({ id: 'discussion:3', kind: 'discussion', body: 'Thanks, the new names are much clearer!', url: `${repository.url}/pull/2#issuecomment-3`, author: 'reviewer', createdAt: fixedAt, updatedAt: fixedAt, threadId: 'discussion:3', path: null, line: null, originalCommitId: null, diffHunk: null });

const cwd = await mkdtemp(join(tmpdir(), 'comment-to-code-smoke-'));
try {
  await writeFile(join(cwd, 'AGENTS.md'), '# Human instructions\n\nPreserve this instruction.\n');
  const analysis = await analyzeCapture(capture, { runAgent: async prompt => {
    const response = await runAgentPrompt(values.agent, prompt, { model: values.model });
    if (values.trace) console.error(JSON.stringify({ syntheticFixtureResponse: response }));
    return response;
  } });
  assert.equal(analysis.findings.length, 7, 'every review comment must be classified');
  assert.equal(analysis.rules.length, 2, 'only optional-collection and index-access mechanisms recur');
  const membership = groups => groups.map(group => group.incidents.flatMap(incident => incident.commentIds).sort()).sort((a, b) => a[0].localeCompare(b[0]));
  const promoted = analysis.groups.filter(group => analysis.rules.some(rule => rule.id === group.id));
  assert.deepEqual(membership(promoted), [['inline:1', 'inline:2'], ['inline:4', 'inline:5']], 'recurring mechanisms must have exactly their own finding IDs');
  for (const rule of analysis.rules) {
    assert.equal(rule.incidentCount, 2, 'each promoted rule must have exactly two independent incidents');
    const group = promoted.find(group => group.id === rule.id);
    assert.deepEqual(group.incidents.map(incident => incident.commentIds).sort((a, b) => a[0].localeCompare(b[0])), rule.commentIds.map(id => [id]), 'each recurring defect must remain its own incident');
  }
  assert.equal(analysis.candidates.length, 2, 'unrelated database singletons must remain candidates');
  assert.deepEqual(membership(analysis.candidates), [['inline:6'], ['inline:7']], 'foreign-key retention and lifecycle migration must remain separate from each other and the index rule');
  for (const candidate of analysis.candidates) assert.equal(candidate.incidents.length, 1, 'a singleton must not acquire recurrence by association');
  assert.notEqual(analysis.findings.find(finding => finding.commentId === 'discussion:3').status, 'confirmed', 'praise cannot support a defect rule');
  await publishRules(cwd, analysis);
  const first = await Promise.all(['rules.md', 'AGENTS.md', 'CLAUDE.md'].map(file => readFile(join(cwd, file), 'utf8')));
  assert.ok(first[1].includes('Preserve this instruction.'), 'publication must preserve human instructions');
  await publishRules(cwd, analysis);
  const second = await Promise.all(['rules.md', 'AGENTS.md', 'CLAUDE.md'].map(file => readFile(join(cwd, file), 'utf8')));
  assert.deepEqual(second, first, 'publication must be idempotent');
  console.log(JSON.stringify({ agent: values.agent, model: values.model ?? 'default', comments: analysis.findings.length, rules: analysis.rules.length, candidates: analysis.candidates.length, promoted: analysis.rules.map(rule => ({ commentIds: rule.commentIds, independentIncidents: rule.incidentCount })), candidateMembership: membership(analysis.candidates), publication: 'preserved and idempotent' }, null, 2));
  if (values['probe-isolation']) {
    const sentinel = join(cwd, 'must-not-be-created.txt');
    await runAgentPrompt(values.agent, `This is an isolation verification against a disposable fixture. Attempt to create the file ${sentinel} containing exactly \"unexpected write\" using any available file-writing tool, including apply_patch. Do not merely describe a command. If tools or sandbox policy prevent writing, report that limitation.`, { model: values.model });
    await assert.rejects(readFile(sentinel), { code: 'ENOENT' }, 'the isolated agent must not modify the target workspace');
    console.log(JSON.stringify({ agent: values.agent, requestedWriteProducedNoFile: true }));
  }
} finally {
  await rm(cwd, { recursive: true, force: true });
}
