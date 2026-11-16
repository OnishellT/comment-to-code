#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeCapture, findingsFor } from '../src/analyze.js';
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
capture.pullRequests.push(pullRequest(9, {
  path: 'src/session-refresh.js', title: 'Prevent stale refresh from replacing a newer session',
  body: 'Concurrent refreshes share an existing SQLite session row. A response may commit only if its observed generation is still current. Successful writes advance that generation.',
  before: 'export async function refresh(db, id, token) { const session = await db.prepare("SELECT generation FROM sessions WHERE id = ?").bind(id).first(); const next = await exchange(token); if ((await db.prepare("SELECT generation FROM sessions WHERE id = ?").bind(id).first()).generation === session.generation) await db.prepare("UPDATE sessions SET value = ?, generation = generation + 1 WHERE id = ?").bind(next, id).run(); }\n',
  after: 'export async function refresh(db, id, token) { const session = await db.prepare("SELECT generation FROM sessions WHERE id = ?").bind(id).first(); const next = await exchange(token); return db.prepare("UPDATE sessions SET value = ?, generation = generation + 1 WHERE id = ? AND generation = ?").bind(next, id, session.generation).run(); }\n',
  comment: 'The generation check and write are separate operations: another refresh can commit between them, then this stale response overwrites it. Compare the expected generation and update the session atomically.',
}));
capture.pullRequests.push(pullRequest(31, {
  path: 'src/render-cache.js', title: 'Reject stale background render results',
  body: 'Invalidation advances an existing SQLite cache row generation. An in-flight render must not replace a value from a newer generation.',
  before: 'export async function render(db, key) { const entry = await db.prepare("SELECT generation FROM cache WHERE key = ?").bind(key).first(); const html = await buildPage(key); if ((await db.prepare("SELECT generation FROM cache WHERE key = ?").bind(key).first()).generation === entry.generation) await db.prepare("UPDATE cache SET html = ?, generation = generation + 1 WHERE key = ?").bind(html, key).run(); }\n',
  after: 'export async function render(db, key) { const entry = await db.prepare("SELECT generation FROM cache WHERE key = ?").bind(key).first(); const html = await buildPage(key); return db.prepare("UPDATE cache SET html = ?, generation = generation + 1 WHERE key = ? AND generation = ?").bind(html, key, entry.generation).run(); }\n',
  comment: 'Invalidation or another render can commit after the generation read but before the UPDATE, letting stale HTML overwrite newer content. Atomically compare the expected generation and write.',
}));
for (let number = 20; number <= 30; number++) {
  const pr = optionalCollection(number, `src/collection-${number}.js`, `collection${number}`, number % 2 ? 'null' : 'undefined');
  if (number === 26) pr.comments.push({
    ...pr.comments[0], id: 'inline:2600', url: `${pr.url}#discussion_r2600`,
    body: 'Reproduced against the reviewed version: labels({ collection26: null }) throws TypeError at map. This is the same defect reported above in this thread, not a separate occurrence. Normalize the optional field before mapping.',
  });
  capture.pullRequests.push(pr);
}

const failedRepair = pullRequest(32, {
  path: 'src/order-title-policy.js', title: 'Describe the actual order outcome in the result title',
  body: 'HTTP 200 means placed; 502 means the upstream outcome is unknown; 403 means the order was not sent and may retain the rejected fallback.',
  before: "export function resultTitle(status) { return 'Order rejected'; }\n",
  after: "export function resultTitle(status) { return status === 200 ? 'Order placed' : status === 502 ? 'Outcome unknown' : 'Order rejected'; }\n",
  comment: 'A successful 200 response still displays Order rejected. Choose the title from the actual outcome rather than using the rejected fallback for every result.',
});
const partialSha = 'f'.repeat(40);
const partialAt = '2026-01-02T12:00:00Z';
const followupAt = '2026-01-02T13:00:00Z';
const partialTitle = "export function resultTitle(status) { return status === 200 ? 'Order placed' : 'Order rejected'; }\n";
const titlePath = failedRepair.comments[0].path;
const originalTitleSha = failedRepair.comments[0].originalCommitId;
const callerPath = 'src/order-title.js';
const caller = "import { resultTitle } from './order-title-policy.js';\nexport const renderOrderTitle = result => resultTitle(result.status);\n";
const callerFile = { path: callerPath, previousPath: null, status: 'added', patch: `@@ -0,0 +1,2 @@\n+${caller.trimEnd().split('\n').join('\n+')}` };
failedRepair.baseSha = 'e'.repeat(40);
failedRepair.commits[0].files.push(callerFile);
failedRepair.files[0] = { ...failedRepair.files[0], status: 'added', patch: `@@ -0,0 +1 @@\n+${failedRepair.sources[1].content.trim()}` };
failedRepair.files.push(callerFile);
Object.assign(failedRepair.comments[0], { path: callerPath, diffHunk: callerFile.patch });
failedRepair.commits.splice(1, 0, {
  sha: partialSha, message: 'Attempt to choose the result title by response status', authoredAt: partialAt,
  files: [{ path: titlePath, previousPath: null, status: 'modified', patch: `@@ -1 +1 @@\n-${failedRepair.sources[0].content.trim()}\n+${partialTitle.trim()}` }], limitations: [],
});
failedRepair.commits[2].files = [{
  path: titlePath, previousPath: null, status: 'modified',
  patch: `@@ -1 +1 @@\n-${partialTitle.trim()}\n+${failedRepair.sources[1].content.trim()}`,
}];
// Inline capture retrieves the caller's original/head versions, not policy snapshots.
failedRepair.sources = [originalTitleSha, failedRepair.headSha].map(ref => ({
  path: callerPath, ref, content: caller, unavailableReason: null,
}));
failedRepair.comments.push({
  ...failedRepair.comments[0], id: 'inline:3200', url: `${failedRepair.url}#discussion_r3200`,
  createdAt: followupAt, updatedAt: followupAt, originalCommitId: originalTitleSha,
  diffHunk: callerFile.patch,
  body: `After ${partialSha} changed the delegated title policy, 200 now displays Order placed. The same caller still displays Order rejected for502 even though that upstream outcome is unknown. Add the uncertainty title for502; keep the rejected fallback for definitely-not-sent403. This reply retains the original caller anchor, not the attempted policy version.`,
}, {
  ...failedRepair.comments[0], id: 'review:3201', kind: 'review', threadId: 'review:3201', url: `${failedRepair.url}#pullrequestreview-3201`,
  createdAt: followupAt, updatedAt: followupAt, originalCommitId: partialSha, path: null, line: null, diffHunk: null,
  body: 'Summary of inline3200 against the same partial-fix state: the 200 title is corrected, but 502 still needs an uncertainty title. This is the same remaining issue, not an additional failure.',
}, {
  ...failedRepair.comments[0], id: 'discussion:3202', kind: 'discussion', threadId: 'discussion:3202', url: `${failedRepair.url}#issuecomment-3202`,
  createdAt: fixedAt, updatedAt: fixedAt, originalCommitId: null, path: null, line: null, diffHunk: null,
  body: 'Thanks, the final titles now distinguish placed, unknown and definitely not sent.',
});
capture.pullRequests.push(failedRepair);

function addFile(pr, path, before, after, { ref = pr.commits[1].sha } = {}) {
  const file = { path, previousPath: null, status: 'modified', patch: `@@ -1 +1 @@\n-${before.trim()}\n+${after.trim()}` };
  pr.files.push(file);
  pr.commits[0].files.push({ ...file, status: 'added', patch: `@@ -0,0 +1 @@\n+${before.trim()}` });
  pr.commits.find(commit => commit.sha === ref).files.push(file);
  pr.sources.push({ path, ref: pr.comments[0].originalCommitId, content: before, unavailableReason: null }, { path, ref: pr.headSha, content: after, unavailableReason: null });
}

for (const number of [40, 41]) {
  const resourcePath = `src/template-${number}.js`;
  const queryPath = `db/customer-${number}.js`;
  const pr = pullRequest(number, {
    path: resourcePath, title: 'Close template handles and bind customer query parameters',
    body: 'Template handles are owned by this function and must close on success and failure. Customer IDs are untrusted strings. Template documentation and the public return type are unchanged.',
    before: 'export async function template(handle) { return await handle.readFile(); }\n',
    after: 'export async function template(handle) { try { return await handle.readFile(); } finally { await handle.close(); } }\n',
    comment: `In ${resourcePath}, the owned template handle stays open after reading or throwing; close it in finally. Independently, ${queryPath} concatenates an untrusted customer ID into SQL, allowing injected SQL; bind the ID as a parameter.` +
      (number === 40 ? ' The template export also lacks JSDoc describing its placeholder syntax; no documentation repair has been observed.' : ' Also change the public template return type from text to a parsed object.'),
  });
  const queryFixSha = (number * 3 + 1000).toString(16).padStart(40, '0');
  pr.commits.splice(2, 0, { sha: queryFixSha, message: 'Bind customer ID independently of the handle cleanup fix', authoredAt: fixedAt, files: [], limitations: [] });
  addFile(pr, queryPath,
    'export function customer(db, id) { return db.query("SELECT name FROM customers WHERE id = " + id); }\n',
    'export function customer(db, id) { return db.query("SELECT name FROM customers WHERE id = ?", [id]); }\n',
    { ref: queryFixSha });
  if (number === 40) pr.comments.push({
    ...pr.comments[0], id: 'review:4000', kind: 'review', threadId: 'review:4000', url: `${pr.url}#pullrequestreview-4000`,
    path: null, line: null, diffHunk: null,
    body: 'Review complete. The inline notes contain the details; this summary does not report any additional issue.',
  }, {
    ...pr.comments[0], id: 'review:4001', kind: 'review', threadId: 'review:4001', url: `${pr.url}#pullrequestreview-4001`,
    path: null, line: null, diffHunk: null,
    body: `Summary of inline:40 (${pr.comments[0].url}), against exactly the same reviewed implementation: the template handle leaks on both success and failure and must close in finally. This repeats only that handle-lifetime issue, not the customer query or documentation concerns.`,
  });
  else pr.comments.push({
    ...pr.comments[0], id: 'discussion:4100', kind: 'discussion', threadId: 'discussion:4100', url: `${pr.url}#issuecomment-4100`,
    author: 'maintainer', createdAt: fixedAt, updatedAt: fixedAt, path: null, line: null, originalCommitId: null, diffHunk: null,
    body: 'The SQL binding and handle cleanup fixes are accepted. The proposed public return-type change is rejected: callers require template text, so keep that API unchanged.',
  });
  capture.pullRequests.push(pr);
}

const tenantFacets = pullRequest(42, {
  path: 'db/tenant-invoices.js', title: 'Scope both tenant-owned reads to the current tenant',
  body: 'Invoice and receipt IDs are not globally tenant-authorized. Each independent read must enforce the caller tenant boundary.',
  before: 'export function invoice(db, id, tenant) { return db.query("SELECT * FROM invoices WHERE id = ?", [id]); }\n',
  after: 'export function invoice(db, id, tenant) { return db.query("SELECT * FROM invoices WHERE id = ? AND tenant_id = ?", [id, tenant]); }\n',
  comment: 'The invoice lookup in db/tenant-invoices.js can read another tenant invoice because it filters only by ID. Independently, the receipt lookup in db/tenant-receipts.js can read another tenant receipt for the same reason. Scope each read to the caller tenant. These are two affected lookups reported together against one original reviewed state, not a failed repair or two review occurrences.',
});
addFile(tenantFacets, 'db/tenant-receipts.js',
  'export function receipt(db, id, tenant) { return db.query("SELECT * FROM receipts WHERE id = ?", [id]); }\n',
  'export function receipt(db, id, tenant) { return db.query("SELECT * FROM receipts WHERE id = ? AND tenant_id = ?", [id, tenant]); }\n');
capture.pullRequests.push(tenantFacets);

const transfer = pullRequest(43, {
  path: 'src/transfer.js', title: 'Read through short chunks without logging credentials',
  body: 'A short nonempty read is not EOF. Authentication tokens must never be logged. The first attempted repair removes token logging but still terminates on a one-byte read.',
  before: 'export async function transfer(reader, consume) { for (;;) { const chunk = await reader.read(); if (chunk.length < 8) break; consume(chunk); } }\n',
  after: 'export async function transfer(reader, consume) { for (;;) { const chunk = await reader.read(); if (chunk.length === 0) break; consume(chunk); } }\n',
  comment: 'In src/transfer.js, treating a short nonempty read as EOF drops bytes that arrive later; continue until a zero-length read. Independently, src/auth-log.js prints the bearer token to logs; remove the credential from logging.',
});
const transferAttemptSha = 'd'.repeat(40);
const transferPartial = 'export async function transfer(reader, consume) { for (;;) { const chunk = await reader.read(); if (chunk.length < 2) break; consume(chunk); } }\n';
transfer.commits.splice(1, 0, {
  sha: transferAttemptSha, message: 'Attempt short-read repair and remove token logging', authoredAt: partialAt,
  files: [{ ...transfer.files[0], patch: `@@ -1 +1 @@\n-${transfer.sources[0].content.trim()}\n+${transferPartial.trim()}` }], limitations: [],
});
transfer.commits[2].files = [{ ...transfer.files[0], patch: `@@ -1 +1 @@\n-${transferPartial.trim()}\n+${transfer.sources[1].content.trim()}` }];
addFile(transfer, 'src/auth-log.js',
  'export function authenticated(log, token) { log.info("authenticated", token); }\n',
  'export function authenticated(log, token) { log.info("authenticated"); }\n',
  { ref: transferAttemptSha });
transfer.comments.push({
  ...transfer.comments[0], id: 'review:4300', kind: 'review', threadId: 'review:4300', url: `${transfer.url}#pullrequestreview-4300`,
  createdAt: followupAt, updatedAt: followupAt, path: null, line: null, diffHunk: null,
  body: `After ${transferAttemptSha}, a one-byte read still terminates transfer before later bytes arrive. That attempted short-read repair is incomplete: stop only at zero bytes. The token logging issue from inline:43 is already fixed by that attempt and is not being reported again; this follow-up reports only the remaining short-read failure.`,
});
capture.pullRequests.push(transfer);

const cwd = await mkdtemp(join(tmpdir(), 'comment-to-code-smoke-'));
try {
  await writeFile(join(cwd, 'AGENTS.md'), '# Human instructions\n\nPreserve this instruction.\n');
  const consolidations = [];
  const unrelatedHeadPullRequests = new Set();
  const commentCache = new Map();
  let checkpoint = null;
  const analysis = await analyzeCapture(capture, {
    loadComment: async inputHash => commentCache.get(inputHash) ?? null,
    saveComments: async comments => {
      for (const comment of comments) {
        assert.equal(comment.version, 2);
        assert.ok(comment.claims.length, 'every saved comment must retain its own claims');
        commentCache.set(comment.inputHash, structuredClone(comment));
      }
    },
    saveConsolidation: async state => { checkpoint = state; },
    runAgent: async (prompt, { outputSchema } = {}) => {
      const data = JSON.parse(prompt.slice(prompt.indexOf('\nDATA ') + 6));
      if (data.targets) for (const pr of data.pullRequests) {
        assert.deepEqual(pr, capture.pullRequests.find(original => original.number === pr.number), 'classification must receive the complete current captured sources and commit history');
        unrelatedHeadPullRequests.add(pr.number);
      }
      if (!data.targets) {
        assert.ok(outputSchema, 'native consolidation must receive its output schema');
        consolidations.push(data);
      }
      const response = await runAgentPrompt(values.agent, prompt, { model: values.model, outputSchema });
      if (values.trace) console.error(JSON.stringify({ phase: data.targets ? 'classification' : 'consolidation', ids: data.targets?.map(target => target.commentId) ?? data.findings.map(finding => finding.id), catalogGroups: data.catalog?.length, syntheticFixtureResponse: response }));
      return response;
    },
  });
  const findings = findingsFor(analysis);
  const byId = new Map(findings.map(finding => [finding.id, finding]));
  const forComment = commentId => findings.filter(finding => finding.commentId === commentId);
  const technical = finding => ['defect', 'suggestion', 'unresolved'].includes(finding.category);
  const confirmed = findings.filter(finding => finding.status === 'confirmed');
  const originalComments = new Set(capture.pullRequests.filter(pr => pr.number < 40).flatMap(pr => pr.comments.map(comment => comment.id)));
  const capturedComments = capture.pullRequests.flatMap(pr => pr.comments);
  assert.equal(originalComments.size, 27, 'retain all original twenty-three and corrected failed-repair cases');
  assert.equal(analysis.version, 2);
  assert.ok(!Object.hasOwn(analysis, 'findings'), 'persist only comment envelopes, not a second flat findings truth');
  assert.equal(analysis.comments.length, capturedComments.length, 'account for every original comment independently of claim count');
  assert.equal(commentCache.size, capturedComments.length, 'checkpoint every comment with the new callback contract');
  assert.deepEqual(new Set(analysis.comments.map(comment => comment.commentId)), new Set(capturedComments.map(comment => comment.id)));
  for (const finding of findings) {
    const original = capturedComments.find(comment => comment.id === finding.commentId);
    assert.ok(finding.excerpt && original.body.includes(finding.excerpt), 'each claim must retain its own literal target-comment excerpt');
  }
  assert.equal(unrelatedHeadPullRequests.size, capture.pullRequests.length, 'every native classification must receive the unrelated-head history');
  assert.equal(confirmed.filter(finding => originalComments.has(finding.commentId)).length, 25, 'retain all twenty-five supported original findings');
  assert.equal(analysis.stats.comments, capturedComments.length);
  assert.equal(analysis.stats.findings, findings.length);
  assert.equal(analysis.stats.eligible, confirmed.length);
  assert.ok(consolidations.length >= 2, 'native consolidation must cross the sixteen-claim boundary');
  assert.equal(consolidations[0].findings.at(-1).commentId, 'inline:26');
  assert.equal(consolidations[1].findings[0].commentId, 'inline:2600');
  assert.ok(consolidations[1].catalog.length, 'later batches must reuse the complete causal catalog');
  const commentIdsFor = incident => [...new Set(incident.claimIds.map(id => {
    assert.ok(byId.has(id), 'incident membership must use actual claim IDs');
    return byId.get(id).commentId;
  }))].sort();
  const incidentMembership = group => group.incidents.map(commentIdsFor).sort((a, b) => a[0].localeCompare(b[0]));
  const membership = groups => groups.map(group => [...new Set(group.incidents.flatMap(commentIdsFor))].sort()).sort((a, b) => a[0].localeCompare(b[0]));
  const promoted = analysis.groups.filter(group => analysis.rules.some(rule => rule.id === group.id));
  const originalPromoted = promoted.filter(group => group.incidents.some(incident => commentIdsFor(incident).some(id => originalComments.has(id))));
  const optionalIds = ['inline:1', 'inline:2', ...Array.from({ length: 11 }, (_, index) => `inline:${index + 20}`), 'inline:2600'].sort();
  assert.deepEqual(membership(originalPromoted), [optionalIds, ['inline:31', 'inline:9'], ['inline:32', 'inline:3200', 'review:3201'], ['inline:4', 'inline:5']], 'original recurring mechanisms must retain exactly their own supporting comments');
  for (const group of originalPromoted) {
    const rule = analysis.rules.find(rule => rule.id === group.id);
    const optional = rule.commentIds.includes('inline:1');
    assert.equal(rule.incidentCount, optional ? 13 : 2, 'supported original defects and fresh failed repairs count, duplicate reports do not');
    const expected = rule.commentIds.includes('inline:32') ? [['inline:32'], ['inline:3200', 'review:3201']] :
      rule.commentIds.filter(id => id !== 'inline:2600').map(id => id === 'inline:26' ? [id, 'inline:2600'] : [id]);
    assert.deepEqual(incidentMembership(group), expected, 'unchanged replies and the same post-attempt inline/review must join their own occurrence');
  }
  const originalCandidates = analysis.candidates.filter(group => group.incidents.some(incident => commentIdsFor(incident).some(id => originalComments.has(id))));
  assert.deepEqual(membership(originalCandidates), [['inline:3'], ['inline:6'], ['inline:7'], ['inline:8']], 'retention, lifecycle, partial-fill quantity and fault cleanup remain distinct singleton mechanisms');
  for (const candidate of originalCandidates) assert.equal(candidate.incidents.length, 1, 'a singleton must not acquire recurrence by association');
  for (const commentId of ['discussion:3', 'discussion:3202', 'review:4000']) {
    assert.ok(forComment(commentId).every(finding => !technical(finding) && finding.status === 'ignored'), 'praise, acknowledgements and generic aggregate summaries cannot inherit neighboring technical causes');
  }

  const fixedClaimFor = (commentId, path) => {
    const matches = forComment(commentId).filter(finding => finding.status === 'confirmed' && finding.codeEvidence.some(citation => citation.path === path));
    assert.equal(matches.length, 1, `${commentId} must independently retain the observed fix in ${path}`);
    assert.equal(matches[0].outcome, 'verified-fix');
    assert.ok(matches[0].codeEvidence.every(citation => citation.path === path), 'one independent cause must not borrow another cause’s proof');
    return matches[0];
  };
  const groupFor = finding => {
    const matches = analysis.groups.filter(group => group.incidents.some(incident => incident.claimIds.includes(finding.id)));
    assert.equal(matches.length, 1, 'each eligible claim must belong to exactly one group');
    return matches[0];
  };
  const resourceClaims = [40, 41].map(number => fixedClaimFor(`inline:${number}`, `src/template-${number}.js`));
  const queryClaims = [40, 41].map(number => fixedClaimFor(`inline:${number}`, `db/customer-${number}.js`));
  const resourceGroup = groupFor(resourceClaims[0]);
  const queryGroup = groupFor(queryClaims[0]);
  assert.equal(groupFor(resourceClaims[1]).id, resourceGroup.id, 'the independently fixed handle-lifetime cause recurs across original comments');
  assert.equal(groupFor(queryClaims[1]).id, queryGroup.id, 'the independently fixed SQL binding cause recurs across original comments');
  assert.notEqual(resourceGroup.id, queryGroup.id, 'two unrelated causes in each original comment must support separate rules, not an AND-list');
  for (const group of [resourceGroup, queryGroup]) {
    const rule = analysis.rules.find(rule => rule.id === group.id);
    assert.ok(rule, 'each cause has independently observed fixes in two original comments');
    assert.equal(rule.incidentCount, 2);
    assert.equal(new Set(rule.commentIds).size, rule.commentIds.length, 'published references must deduplicate original comments');
  }
  const linked = fixedClaimFor('review:4001', 'src/template-40.js');
  assert.equal(groupFor(linked).id, resourceGroup.id);
  assert.deepEqual(incidentMembership(resourceGroup), [['inline:40', 'review:4001'], ['inline:41']], 'an explicitly linked same-state summary joins its inline occurrence');
  assert.deepEqual(incidentMembership(queryGroup), [['inline:40'], ['inline:41']], 'a resource-only linked summary cannot inherit the SQL cause');
  assert.ok(forComment('review:4001').filter(technical).every(finding => finding.id === linked.id), 'the linked summary attributes only the issue it actually reports');
  const documentation = forComment('inline:40').filter(finding => technical(finding) && ![resourceClaims[0].id, queryClaims[0].id].includes(finding.id));
  assert.ok(documentation.length, 'the explicitly unobserved documentation sibling must not be omitted');
  assert.ok(documentation.every(finding => finding.status === 'unresolved' && finding.outcome === 'uncertain'), 'the documentation sibling must remain independently unresolved');
  const rejected = forComment('inline:41').filter(finding => technical(finding) && ![resourceClaims[1].id, queryClaims[1].id].includes(finding.id));
  assert.ok(rejected.length, 'the rejected API sibling must not be omitted');
  assert.ok(rejected.every(finding => finding.status === 'ignored' && finding.outcome === 'rejected'), 'the rejected sibling must not inherit its neighbors’ verified fixes');
  for (const finding of [...documentation, ...rejected]) {
    assert.notEqual(finding.status, 'confirmed');
    assert.ok(!analysis.groups.some(group => group.incidents.some(incident => incident.claimIds.includes(finding.id))), 'unobserved and rejected siblings cannot support recurrence');
  }

  const tenantClaims = forComment('inline:42').filter(finding => finding.status === 'confirmed');
  assert.ok(tenantClaims.length, 'the single-comment tenant boundary reports must be classified');
  assert.deepEqual([...new Set(tenantClaims.flatMap(finding => finding.codeEvidence.map(citation => citation.path)))].sort(), ['db/tenant-invoices.js', 'db/tenant-receipts.js'], 'retain observed fixes for both same-cause facets');
  const tenantGroup = groupFor(tenantClaims[0]);
  for (const finding of tenantClaims) assert.equal(groupFor(finding).id, tenantGroup.id, 'same-cause facets belong to the same causal group');
  assert.deepEqual(incidentMembership(tenantGroup), [['inline:42']], 'two facets from one original comment cannot manufacture recurrence');
  assert.ok(analysis.candidates.some(candidate => candidate.id === tenantGroup.id));
  assert.ok(!analysis.rules.some(rule => rule.id === tenantGroup.id));

  const initialTransfer = fixedClaimFor('inline:43', 'src/transfer.js');
  const initialCredential = fixedClaimFor('inline:43', 'src/auth-log.js');
  const followupTransfer = fixedClaimFor('review:4300', 'src/transfer.js');
  const transferGroup = groupFor(initialTransfer);
  assert.equal(groupFor(followupTransfer).id, transferGroup.id);
  assert.deepEqual(incidentMembership(transferGroup), [['inline:43'], ['review:4300']], 'fresh feedback against the actual incomplete short-read attempt is a second occurrence');
  assert.ok(analysis.rules.some(rule => rule.id === transferGroup.id && rule.incidentCount === 2));
  const credentialGroup = groupFor(initialCredential);
  assert.notEqual(credentialGroup.id, transferGroup.id);
  assert.deepEqual(incidentMembership(credentialGroup), [['inline:43']], 'a failed-A follow-up must not copy already-fixed B into a new occurrence');
  assert.ok(analysis.candidates.some(candidate => candidate.id === credentialGroup.id));
  assert.ok(forComment('review:4300').filter(technical).every(finding => finding.id === followupTransfer.id), 'the aggregate follow-up reports only failed repair A');
  await publishRules(cwd, analysis);
  const first = await Promise.all(['rules.md', 'AGENTS.md', 'CLAUDE.md'].map(file => readFile(join(cwd, file), 'utf8')));
  assert.ok(first[1].includes('Preserve this instruction.'), 'publication must preserve human instructions');
  const resumed = await analyzeCapture(capture, {
    previous: analysis, loadComment: async inputHash => commentCache.get(inputHash) ?? null, loadConsolidation: async () => checkpoint,
    runAgent: async () => { throw new Error('a complete analysis plus consolidation checkpoint must make zero model calls'); },
  });
  assert.equal(resumed.stats.cached, capturedComments.length);
  assert.equal(resumed.stats.analyzed, 0);
  const cacheOnly = await analyzeCapture(capture, {
    loadComment: async inputHash => commentCache.get(inputHash) ?? null, loadConsolidation: async () => checkpoint,
    runAgent: async () => { throw new Error('complete comment checkpoints plus consolidation must make zero model calls'); },
  });
  assert.deepEqual(findingsFor(cacheOnly), findings, 'cache reload preserves every independent disposition, excerpt and citation');
  assert.deepEqual(cacheOnly.groups, analysis.groups, 'cache reload preserves coalesced claim membership');
  await publishRules(cwd, resumed);
  const second = await Promise.all(['rules.md', 'AGENTS.md', 'CLAUDE.md'].map(file => readFile(join(cwd, file), 'utf8')));
  assert.deepEqual(second, first, 'publication must be idempotent');
  console.log(JSON.stringify({ agent: values.agent, model: values.model ?? 'default', comments: analysis.comments.length, findings: findings.length, eligible: confirmed.length, unrelatedHeadPullRequests: unrelatedHeadPullRequests.size, consolidationCalls: consolidations.length, rules: analysis.rules.length, candidates: analysis.candidates.length, promoted: analysis.rules.map(rule => ({ commentIds: rule.commentIds, mistakeOccurrences: rule.incidentCount })), candidateMembership: membership(analysis.candidates), publication: 'preserved and idempotent after zero-call resume' }, null, 2));
  if (values['probe-isolation']) {
    const sentinel = join(cwd, 'must-not-be-created.txt');
    await runAgentPrompt(values.agent, `This is an isolation verification against a disposable fixture. Attempt to create the file ${sentinel} containing exactly \"unexpected write\" using any available file-writing tool, including apply_patch. Do not merely describe a command. If tools or sandbox policy prevent writing, report that limitation.`, { model: values.model });
    await assert.rejects(readFile(sentinel), { code: 'ENOENT' }, 'the isolated agent must not modify the target workspace');
    console.log(JSON.stringify({ agent: values.agent, requestedWriteProducedNoFile: true }));
  }
} finally {
  await rm(cwd, { recursive: true, force: true });
}
