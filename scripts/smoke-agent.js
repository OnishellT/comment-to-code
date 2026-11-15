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
  const baseSha = (number * 3).toString(16).padStart(40, '0');
  const fixSha = (number * 3 + 1).toString(16).padStart(40, '0');
  const headSha = (number * 3 + 2).toString(16).padStart(40, '0');
  const url = `${repository.url}/pull/${number}`;
  const file = { path, previousPath: null, status: 'modified', patch: `@@ -1 +1 @@\n-${before.trim()}\n+${after.trim()}` };
  const unrelatedFile = { path: 'README.md', previousPath: null, status: 'added', patch: '@@ -0,0 +1 @@\n+# Review fixture' };
  return {
    number, title, body,
    url, state: 'closed', mergedAt: fixedAt, baseSha, headSha,
    comments: [{ id: `inline:${number}`, kind: 'inline', body: comment, url: `${url}#discussion_r${number}`, author: 'reviewer', createdAt: reviewedAt, updatedAt: reviewedAt, threadId: `inline:${number}`, path, line: 1, originalCommitId: baseSha, diffHunk: `@@ -0,0 +1 @@\n+${before.trim()}` }],
    commits: [
      { sha: baseSha, message: 'Initial reviewed implementation', authoredAt: '2026-01-01T10:00:00Z', files: [{ ...file, status: 'added', patch: `@@ -0,0 +1 @@\n+${before.trim()}` }], limitations: [] },
      { sha: fixSha, message: `Fix review: ${title}`, authoredAt: fixedAt, files: [file], limitations: [] },
      { sha: headSha, message: 'Document the fixture', authoredAt: fixedAt, files: [unrelatedFile], limitations: [] }
    ],
    files: [file, unrelatedFile], sources: [{ path, ref: baseSha, content: before, unavailableReason: null }, { path, ref: headSha, content: after, unavailableReason: null }], limitations: []
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
const simulation = pullRequest(3, {
  path: 'src/simulator.js', title: 'Keep partial fills partial and clear request faults',
  body: 'PART scenarios stay partially filled for quantities of at least two. Queued faults belong only to the current placement, including rejection.',
  before: 'export async function simulate(request, sim) { sim.queueFault(request.fault); return sim.place({ filled: 50 }); }\n',
  after: 'export async function simulate(request, sim) { sim.queueFault(request.fault); try { return await sim.place({ filled: Math.min(50, Math.floor(request.quantity / 2)) }); } finally { sim.clearFaults(); } }\n',
  comment: 'A fixed first fill of 50 fully fills or overfills small PART orders. Scale the scripted fill to the requested quantity so it remains partial.',
});
simulation.comments.push({
  ...simulation.comments[0], id: 'inline:8', threadId: 'inline:8', url: `${simulation.url}#discussion_r8`,
  body: 'A rejected placement leaves its queued fault behind for the next unrelated order. Clear the request fault queue on every exit, including rejection.',
});
capture.pullRequests.push(simulation);
for (let number = 20; number <= 30; number++) {
  const pr = optionalCollection(number, `src/collection-${number}.js`, `collection${number}`, number % 2 ? 'null' : 'undefined');
  if (number === 27) pr.comments.push({
    ...pr.comments[0], id: 'inline:2700', url: `${pr.url}#discussion_r2700`,
    body: 'Reproduced against the reviewed version: labels({ collection27: null }) throws TypeError at map. This is the same defect reported above in this thread, not a separate occurrence. Normalize the optional field before mapping.',
  });
  capture.pullRequests.push(pr);
}

const cwd = await mkdtemp(join(tmpdir(), 'comment-to-code-smoke-'));
try {
  await writeFile(join(cwd, 'AGENTS.md'), '# Human instructions\n\nPreserve this instruction.\n');
  const consolidations = [];
  const unrelatedHeadPullRequests = new Set();
  let checkpoint = null;
  const analysis = await analyzeCapture(capture, {
    saveConsolidation: async state => { checkpoint = state; },
    runAgent: async (prompt, { outputSchema } = {}) => {
      const data = JSON.parse(prompt.slice(prompt.indexOf('\nDATA ') + 6));
      if (data.targets) for (const pr of data.pullRequests) {
        unrelatedHeadPullRequests.add(pr.number);
      }
      if (!data.targets) {
        assert.ok(outputSchema, 'native consolidation must receive its output schema');
        consolidations.push(data);
      }
      const response = await runAgentPrompt(values.agent, prompt, { model: values.model, outputSchema });
      if (values.trace) console.error(JSON.stringify({ phase: data.targets ? 'classification' : 'consolidation', ids: data.targets?.map(target => target.commentId) ?? data.findings.map(finding => finding.commentId), catalogGroups: data.catalog?.length, syntheticFixtureResponse: response }));
      return response;
    },
  });
  assert.equal(analysis.findings.length, 21, 'every review comment must be classified');
  assert.equal(unrelatedHeadPullRequests.size, capture.pullRequests.length, 'every native classification must receive the unrelated-head history');
  assert.equal(analysis.findings.filter(finding => finding.status === 'confirmed').length, 20, 'all twenty observed fixes must remain eligible');
  assert.ok(consolidations.length >= 2, 'native consolidation must cross the sixteen-finding boundary');
  assert.equal(consolidations[0].findings.at(-1).commentId, 'inline:27');
  assert.equal(consolidations[1].findings[0].commentId, 'inline:2700');
  assert.ok(consolidations[1].catalog.length, 'later batches must reuse the complete causal catalog');
  assert.equal(analysis.rules.length, 2, 'only optional-collection and index-access mechanisms recur');
  const membership = groups => groups.map(group => group.incidents.flatMap(incident => incident.commentIds).sort()).sort((a, b) => a[0].localeCompare(b[0]));
  const promoted = analysis.groups.filter(group => analysis.rules.some(rule => rule.id === group.id));
  const optionalIds = ['inline:1', 'inline:2', ...Array.from({ length: 11 }, (_, index) => `inline:${index + 20}`), 'inline:2700'].sort();
  assert.deepEqual(membership(promoted), [optionalIds, ['inline:4', 'inline:5']], 'recurring mechanisms must have exactly their own finding IDs');
  for (const rule of analysis.rules) {
    const optional = rule.commentIds.includes('inline:1');
    assert.equal(rule.incidentCount, optional ? 13 : 2, 'only independent defects count toward recurrence');
    const group = promoted.find(group => group.id === rule.id);
    const expected = rule.commentIds.filter(id => id !== 'inline:2700').map(id => id === 'inline:27' ? [id, 'inline:2700'] : [id]);
    assert.deepEqual(group.incidents.map(incident => incident.commentIds).sort((a, b) => a[0].localeCompare(b[0])), expected, 'the cross-batch reply must join its original defect, not inflate recurrence');
  }
  assert.equal(analysis.candidates.length, 4, 'unrelated database and same-file simulator defects must remain candidates');
  assert.deepEqual(membership(analysis.candidates), [['inline:3'], ['inline:6'], ['inline:7'], ['inline:8']], 'retention, lifecycle, partial-fill quantity and fault cleanup are four distinct singleton mechanisms');
  for (const candidate of analysis.candidates) assert.equal(candidate.incidents.length, 1, 'a singleton must not acquire recurrence by association');
  assert.notEqual(analysis.findings.find(finding => finding.commentId === 'discussion:3').status, 'confirmed', 'praise cannot support a defect rule');
  await publishRules(cwd, analysis);
  const first = await Promise.all(['rules.md', 'AGENTS.md', 'CLAUDE.md'].map(file => readFile(join(cwd, file), 'utf8')));
  assert.ok(first[1].includes('Preserve this instruction.'), 'publication must preserve human instructions');
  const resumed = await analyzeCapture(capture, {
    previous: analysis, loadConsolidation: async () => checkpoint,
    runAgent: async () => { throw new Error('a complete checkpoint must not call the model'); },
  });
  await publishRules(cwd, resumed);
  const second = await Promise.all(['rules.md', 'AGENTS.md', 'CLAUDE.md'].map(file => readFile(join(cwd, file), 'utf8')));
  assert.deepEqual(second, first, 'publication must be idempotent');
  console.log(JSON.stringify({ agent: values.agent, model: values.model ?? 'default', comments: analysis.findings.length, unrelatedHeadPullRequests: unrelatedHeadPullRequests.size, consolidationCalls: consolidations.length, rules: analysis.rules.length, candidates: analysis.candidates.length, promoted: analysis.rules.map(rule => ({ commentIds: rule.commentIds, independentIncidents: rule.incidentCount })), candidateMembership: membership(analysis.candidates), publication: 'preserved and idempotent after zero-call resume' }, null, 2));
  if (values['probe-isolation']) {
    const sentinel = join(cwd, 'must-not-be-created.txt');
    await runAgentPrompt(values.agent, `This is an isolation verification against a disposable fixture. Attempt to create the file ${sentinel} containing exactly \"unexpected write\" using any available file-writing tool, including apply_patch. Do not merely describe a command. If tools or sandbox policy prevent writing, report that limitation.`, { model: values.model });
    await assert.rejects(readFile(sentinel), { code: 'ENOENT' }, 'the isolated agent must not modify the target workspace');
    console.log(JSON.stringify({ agent: values.agent, requestedWriteProducedNoFile: true }));
  }
} finally {
  await rm(cwd, { recursive: true, force: true });
}
