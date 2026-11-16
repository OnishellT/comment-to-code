# MVP: Learn preventive rules from PR history

## Scope and success

Issue31 implementation follows ADR0009: version2 comment envelopes with independent literal-evidenced claims, application-owned content IDs, claim-ID partitions and original-comment recurrence coalescing. Classification uses causal-claims-v7; prior v6/analysis/consolidation formats are incompatible and never migrated. Persist only comments, derive findings, preserve whole-batch validation and one complete citation correction. Full npm consumer verification and native syntax follow implementation; real providers remain parent-owned.

A user inside a local GitHub checkout can install comment-to-code and its agent skill, capture all accessible PR discussion/review history, analyze every comment with OMP/Claude Code/Codex, and generate a small evidence-backed rules.md plus non-destructive AGENTS.md/CLAUDE.md references. Promotion requires two supported mistake occurrences with the same verified root cause: independent original defects or fresh substantive feedback after an evidenced relevant failed repair. No gates/hooks.

## Feature issues / independent ownership

1. Capture GitHub evidence: src/capture.js and test/capture.test.js. Own pagination, identity, lifecycle metadata, comments/reviews/replies, commits/patches, reviewed/final code, explicit context limitations. No CLI/analysis changes.
2. Analyze causes and publish rules: src/analyze.js, src/publish.js, test/analyze.test.js, test/publish.test.js. Own validated comment classifications, root-cause consolidation, two-supported-occurrence threshold, candidates, managed Markdown blocks. No capture/runtime changes.
3. Installable CLI and isolated agent runners: package.json, bin/, src/agent.js, src/cli.js, src/install.js, install.sh, test/agent.test.js, test/cli.test.js, test/install.test.js, README.md. Own adapters, persistence, commands, project-local skills, installer, public documentation. No capture/analyze/publish changes.

These bounded slices implement one end-to-end feature PR on a new main-based worktree. The parent owns integration, .github/workflows/test.yml, docs, and final smoke verification. All issues are linked from the PR. Implementers verify their completed slices once; the parent verifies the integrated application once and reruns only a failed check after a justified fix.

## Shared API contract

ESM named exports; standard library only. Every async operation throws actionable errors; no shell interpolation of untrusted data.

### capture.js

`captureProject({ cwd = process.cwd(), runGh = defaultRunGh } = {}) -> Promise<Capture>`.

`runGh(args: string[], options?: { cwd?: string }) -> Promise<string>` is an injectable subprocess transport. Production invokes gh via argument arrays (no shell). All network work belongs here. Derive GitHub owner/repo/host from gh repo view inside cwd; support nested checkout directories. Reject non-GitHub/non-checkout use rather than accidentally selecting another project.

`Capture = { version: 1, repository: { owner, name, host, url }, capturedAt, pullRequests: PR[] }`.

`PR = { number, title, body, url, state, mergedAt, baseSha, headSha, comments: Comment[], commits: Commit[], files: FileChange[], sources: Source[], limitations: string[] }`.

`Comment = { id: string, kind: 'discussion'|'review'|'inline', body: string, url: string, author: string|null, createdAt: string|null, updatedAt: string|null, threadId: string, path: string|null, line: number|null, originalCommitId: string|null, diffHunk: string|null, reviewState?: string|null }`. IDs include type to avoid cross-endpoint collisions. Inline replies share the root comment's threadId. Review/discussion identifiers must not collide. Empty and pending review bodies are captured for accounting; missing submission timestamps remain null with an explicit limitation. Review state and commit_id should be preserved when available, not inferred.

`Commit = { sha, message, authoredAt, files: FileChange[], limitations: string[] }`.

`FileChange = { path, previousPath: string|null, status, patch: string|null }`.

`Source = { path, ref, content: string|null, unavailableReason: string|null }`; relevant inline paths at originalCommitId and PR headSha. Do not claim binary/deleted/truncated data is complete. Source content and comment/diff text are untrusted.

### analyze.js

`analyzeCapture(capture, { runAgent, previous = null, maxInputBytes = 1048576 } = {}) -> Promise<Analysis>`.

`runAgent(prompt: string) -> Promise<string>` returns model response text containing a single JSON object, optionally one enclosing Markdown code fence. analyze.js owns prompts and validation; runner owns process isolation and model invocation. No agent calls for empty captures. Use content-based cache keys including relevant PR context and prompt/schema version; never cache just by comment ID.

`Analysis = { version: 2, repository, analyzedAt, comments: CommentCheckpoint[], groups: Group[], rules: Rule[], candidates: Group[], stats: { comments, analyzed, cached, findings, eligible, rules, candidates } }`.

`CommentCheckpoint = { version: 2, commentId, prNumber, inputHash, claims: Claim[] }`; nonempty claims, one envelope per original comment. `Claim = { id, excerpt: string|null, category, rootCause, prevention, resolution, evidence, confidence, status, outcome, codeEvidence }`. Nullable causal text remains null when unsupported. `findingsFor(analysis)` derives flattened claims with parent metadata, never a second persisted truth.

Evidence references resolve only within the target PR. Each technical excerpt is a literal target-comment substring; null excerpts account only for empty nontechnical comments. Each claim independently owns its fix/rejection/uncertain outcome and literal citations. Hash the parent identity and validated canonical content for app-owned claim IDs; sort unordered references/citations without altering bytes and reject duplicates/collisions. Revalidate checkpoint proof against actual capture on reuse. Whole-batch structural/ownership/excerpt/disposition checks precede save or one full-replacement citation correction, which cannot drop technical siblings. Complete literal changed lines are required, including genuine empty changed lines.

`Group = { id, rootCause, prevention, incidents: { id, claimIds: string[], explanation: string }[] }`.

`Rule = { id, rootCause, instruction, incidentCount, commentIds: string[], evidence: string[] }`.

Consolidation partitions all eligible claim IDs exactly once, at most16 per delta. In each group, coalesce incidents transitively by shared original comment identity so facets cannot manufacture recurrence across batches/resume/publication; different groups can share a comment. Rules deduplicate original comment IDs/references. Model assignments and snapshot joins otherwise own evidenced failed-repair lineage; no PR/thread/time/anchor/hash veto. Preserve paired invariant refinement and accepted alternatives. Completed catalog members carry own literal excerpts, causal proof, outcomes/citations and provenance; active PRs retain complete available artifacts and ALL captured commentary, including noneligible inline context and rejected alternatives regardless of thread or link form. Context-only commentary is not an extra finding or occurrence. Label projection separately from unavailable capture. Classification causal-claims-v7 and analysis/consolidation version2 reject incompatible old objects without migration. Persist comment envelopes through loadComment/saveComments in comments/<inputHash>.json. Earlier implementation sections below record historical versions, superseded by ADR0009 where incompatible.

### publish.js

`publishRules(cwd, analysis) -> Promise<{ files: string[] }>` writes rules.md, AGENTS.md, CLAUDE.md. Preserve human content outside exact `<!-- comment-to-code:start -->` / `<!-- comment-to-code:end -->` markers. Existing malformed/multiple blocks or symlinks: fail before modifying any file. Same input yields byte-identical managed content. Render concise actionable rules with counts and evidence links; candidates stay in JSON, not instruction files. Do not empty previous published rules on incomplete analysis.

### agent.js

`runAgentPrompt(agent, prompt, { model, timeoutMs = 300000 } = {}) -> Promise<string>` supports exactly omp|claude|codex. Create temporary isolated cwd outside the project; disable tools, skills, project instructions, extensions/MCP where supported. Codex exec has no global no-tools switch: disable optional execution tools, ignore user config/rules, use read-only sandbox and never-approve policy; document residual registered tools rather than hacking model metadata. No permission/sandbox bypass flags. Send prompt via stdin, never argv/shell. Use ephemeral sessions and remove temporary artifacts. Capture stderr for actionable errors without leaking auth. Parse provider envelopes in runner; analyze.js validates model JSON. OMP text mode; Claude JSON result envelope; Codex final output file. Explicitly document limits of provider isolation; never claim a sandbox that is not configured.

### CLI and installation

Executable `comment-to-code`:

- `install [--agent omp|claude|codex|all]`: install project-local SKILL.md instructions for selected agents, preserving/refusing unmanaged existing targets and refusing symlinks. No gates/hooks or credential changes.
- `capture`: identify cwd repo and write complete .comment-to-code/capture.json only on success.
- `analyze --agent omp|claude|codex [--model NAME] [--max-input-bytes N]`: read capture, run real selected agent, persist validated analysis.json, publish rules. Ensure capture repository matches cwd repo; stale/cross-repo captures are rejected, not silently consumed.
- `run --agent ...`: capture then analyze.
- `--help`, `--version`.

Local .comment-to-code data must not become tracked accidentally: installer/first write adds a clearly scoped .gitignore entry without overwriting existing content, and fails before publishing private captures if ignore cannot be safely established. Do not log raw private prompts by default. Atomic JSON replacement; incomplete runs retain last successful artifacts. npm install -g . plus a small install.sh (no sudo, curl-pipe-shell, hidden downloads beyond npm install). Include uninstall instructions for the CLI and agent skill files.

## Acceptance / real verification

- Paginated offline transport fixtures exercise all PR states, all three comment kinds, replies, commit patches, unavailable code, and GitHub API limits/errors. No silent omission.
- Analysis fixtures prove every-comment accounting, two supported occurrences → one rule, one occurrence/unchanged replies → candidate, independent original defects within one PR, evidenced fresh failed repairs, duplicate post-attempt reviews, conservative unknown lineage, evidence validation, cache invalidation, malformed output, uncertain/rejected fixes, and no duplicate rules on rerun.
- Publication preserves user text, is idempotent, rejects malformed markers and symlinks before writes.
- Each adapter is exercised through real subprocess execution against a fixture executable with exact stdin/output protocol; at least one real installed agent analyzes a small reviewed-code fixture end-to-end. Never call fake fixtures real model verification.
- Installed package smoke in a temporary checkout: install skills for all three agents, invoke --help, capture a real GitHub project, run an actual model analysis scenario, inspect generated files. No tests asserting source text/wiring only.
- CI runs npm test on Node 22. Independent reviewer receives feature contract, ADR, issue acceptance, diff, and verification evidence. Fix actual problems, not speculative abstractions. Merge only after all criteria and checks pass.

## Issue #5: Literal evidence-reference contract

Real complete-history analysis failed with two installed backends because classification evidence entries mixed a captured URL with explanatory prose. Strict reference validation rejected publication correctly. Fix the producer contract, not the rejecting validator.

1. Make evidence an explicit array of literal captured reference strings, never Markdown or explanations. Non-actionable ignored findings need no evidence references. Reuse the existing evidence owner if an allowlist improves clarity.
2. Advance the prompt version so content-based finding caches cannot reuse the old contract. Keep exact citation matching, observed-code quotation checks, complete comment accounting, and promotion thresholds unchanged.
3. Do not normalize malformed references, add heuristic bot filtering, retry automatically, or accept partial analysis. Do not add prompt-wording tests.
4. Run focused analysis/publication checks after the change, then install the candidate artifact separately and replay the unchanged complete failing capture with a real backend in an isolated checkout. Inspect every disposition and preserve human instruction bytes.
5. Judge rejected or unmerged safety discussions as evidence of concerns, not automatically as verified recurring fixes. Report remaining failures without manufacturing documents.
6. Review the exact diff and real evidence in a PR closing #5; merge only after independent review and green CI. Keep all private captures, responses, and generated project documents local.

## Issue #6: Technical content inside workflow comments

The first complete candidate replay fixed literal references and correctly produced no promoted rules, but collapsed a substantive rejected/unmerged safety discussion into administration with no retained explanation. Classify the technical content, not the workflow wrapper.

1. Distinguish pure administration or a walkthrough without a reported defect from comments that explicitly report failures, safety gaps, or a rejected technical approach. Do not special-case a repository, comment ID, author, or bot.
2. Retain supported cause/resolution information for substantive technical comments even when ignored or unresolved. Closure, rejection, and an unmerged branch must not be inferred to establish a verified fix.
3. Advance the prompt contract version and preserve strict validation. Do not introduce a rule without two independently verified incidents.
4. Preserve the first candidate artifact and report as a real semantic failure. Install a separate revised artifact and replay the same complete capture without a prior-analysis cache; inspect all dispositions and actual documents.
5. Include both #5 and #6 acceptance evidence and fixture-normalization limits in independent PR review before merge. A literal-format pass alone is not full causal-quality acceptance.

## Bounded, resumable full-history analysis

User approved batching and validated checkpoints before further large-history retries. ADR 0002 is the shared implementation contract.

1. Batch at most 16 sorted pending targets, packing complete distinct PR contexts within maxInputBytes; no context truncation or comment omission. Validate exact target coverage and PR-local code citations before saving a batch.
2. Add optional loadFinding(inputHash) and saveFindings(findings) analyzer callbacks. Reuse complete previous analyses first, then matching validated checkpoints. Store only findings; reconsolidate current eligible findings once and publish only a complete result.
3. CLI owns .comment-to-code/findings/<inputHash>.json with owner-only directories/files, atomic writes, safe paths and effective gitignore checks. A failed later call must retain validated progress and prior published documents; a resumed run must request only missing findings.
4. Migrate every model fixture to {findings:[{commentId,...classificationFields}]}; no old single-result alias. Retain strict structural/citation/incident protections and the bounded-memory regression.
5. Batch and checkpoint slices implement in parallel in this main-based worktree with disjoint ownership. Parent integrates, installs the real artifact, resumes full real captures and judges every promoted rule. Independent PR review and final CI precede merge.

## Issue #11: Copy literal changed-line evidence

Installed v5 runs exposed five quotes that were exact captured patch substrings but omitted the literal changed-line marker. Strict validation correctly rejected both batches; 35 previously validated findings survived in the larger replay.

- Add generic valid/invalid examples and explicit copying guidance for diff markers and indentation. Never normalize model output or fabricate a prefix.
- Keep the v5 response/eligibility contract and validators unchanged. This format-only guidance does not invalidate findings already validated under that same contract; reuse them on the installed replay.
- Add the observed missing-marker substring to the existing quotation-rejection regression, then run its focused check once. Pack a separate artifact, verify real checkpoint reuse and actual citations, and request review of this correction before merge.

## Issue #12: Separate contextual references from observed fixes

Real installed resumes reused 35 findings and advanced to 112/115 saved findings before rejecting reviewed-commit SHAs already present in typed capture metadata and source refs. The contextual reference allowlist was incomplete, not the model's literal reference.

- Include captured base/head, original review commit and source refs in contextual references. Never discover allowed SHAs by scanning arbitrary prose.
- Keep eligible changed-code records and exact code-quotation validation unchanged. A contextual baseline SHA alone cannot establish an observed fix.
- Add focused typed-reference acceptance and baseline-only/fabricated-reference rejection coverage. Replay the preserved real failing batches without filesystem writes, then install a separate candidate and resume the complete unchanged captures.
- Keep compatible already-validated v5 findings: this corrects the implementation of the existing literal-captured-reference contract rather than changing its response schema or recurrence threshold. Obtain incremental independent review and final CI before merge.

## Issue #13: Recognize unified-diff hunk structure

The next installed replay correctly reused 112 findings but rejected a byte-exact added Markdown-list line beginning with adjacent plus/minus signs. The validator's two-character heuristic confused signed changed content with file headers.

- Derive changed lines from unified-diff hunk bodies and reuse them for patch eligibility and citation checks. Do not special-case Markdown filenames or normalize quotes.
- Preserve exact substring matching and support quoted changed-line prefixes while requiring them to match actual changed hunk lines. Headers/context alone remain ineligible; paired head-source proof remains unchanged.
- Cover signed added/deleted content and header/context rejection; replay the exact preserved failing native response.
- Advance the prompt/validation epoch to v6. Matching a real changed-hunk line is stricter than the old substring/sign check, which could admit a sign-prefixed fragment taken from context. Persisted findings do not retain their original code quotations, so old accepted proof cannot be revalidated from those files. Preserve historical v5 artifacts, but do not reuse them as v6 findings.

## Issue #14: Use Codex's machine-output protocol

Native Codex human output echoes the complete prompt to stderr, crossing the existing 64 KiB diagnostic bound before analysis. A preserved actual stderr trace establishes the cause.

- Select supported exec --json events while continuing to read only --output-last-message for the final response. Keep all isolation, no-tools/read-only settings and resource bounds unchanged.
- Add a behavioral regression for a full input larger than the stderr bound and exact final-response extraction, plus independent oversized-stderr rejection. Observe the large-input regression fail before changing the adapter.
- No truncation, diagnostic discarding, raised limits, fallback, new configuration, or cache-epoch change. This changes transport formatting, not the classifier/evidence contract.
- Run focused adapter checks, install a separate artifact and resume the unchanged complete captures. Passing the subprocess boundary is not complete-history success. Require independent review and green CI before merge.

## Issue #16: Causal mechanisms instead of topic buckets

ADR 0003 governs this correction. A complete real analysis structurally passed but mixed unrelated identifier, dependency and type-safety mechanisms, and combined index, foreign-key and migration defects. A concrete causal-separation assertion is red; preserve the unendorsed output.

1. Strengthen only consolidatePrompt: one failure mechanism and a preventive intervention shared by every grouped incident. Partitioning all findings must allow singleton candidates. Prefer causal correctness over a low rule count; merge synonyms, not topic-wide checklists.
2. Extend scripts/smoke-agent.js, reusing its capture/publication helpers: retain optional-collection recurrence and praise, add two independent index-access defects plus unrelated singleton foreign-key and lifecycle-migration defects. Assert membership, exact independent counts and candidacy without pinning wording.
3. Keep classification, schemas, evidence validation, v6 finding hashes, thread/incident protections, thresholds and publication unchanged. No heuristic semantic gate, second judge pipeline, post-hoc rule editing, dependency or provider retry.
4. Delegate analyzer/smoke implementation in this main-based worktree; parent owns ADR/plan/progress, integration, installed complete-capture replay and final judgment. Independent read-only review examines the preserved bad consolidation while implementation proceeds.
5. Run focused checks and one real native smoke after implementation. Install separately and re-consolidate the complete unchanged capture with every finding reused. Judge resulting rules, then request contextual PR review and green CI before scoped merge. The nine-file customer task remains open until all three histories complete and resulting documents are shown honestly.

## Issue19 — explicit bounded analysis deadlines

The real complete-history causal replay timed out after five minutes. Add `--agent-timeout-ms N` to analysis commands, forwarding to the existing adapter deadline with unchanged default, isolation, byte limits and v6 finding hashes. Validate positive integer Node timer bounds before execution. Verify through the actual CLI and a timed fixture subprocess: short deadline aborts without replacing prior artifacts/checkpointing incomplete work; sufficient deadline completes classification/consolidation. Document units and scope. Install the candidate and repeat the unchanged full-history replay with an explicit fifteen-minute bound before approving PR17.

## Issue16 follow-through — respect observed resolutions

The complete raw146-group audit finds systematic mismatches beyond a duplicate placeholder. Ground each mechanism/intervention in every constituent's observed resolution, preserve accepted alternative remedies, split incident-specific/opposite safeguards and reconcile genuinely synonymous cores. Add one same-PR/file simulator counterexample to the existing native smoke: independent partial-fill scaling and fault cleanup stay singleton candidates. Run focused checks and parse the extended smoke; native nine-comment and complete-history verification must wait for the explicitly observed provider reset. Keep strict rejection, all evidence and v6 findings; no unchanged native retry or hand-repaired documents.

## Issue21 — bounded, resumable causal consolidation

The post-reset native nine-comment scenario passed, but the complete609-finding call emitted partial JSON and an interactive question rather than a finished partition. The native envelope reports ordinary completion, not truncation. Replaying that captured result through the real analyzer deterministically reproduces rejection; strict parsing is correct.

Replace one-shot global output with sequential batches of at most16eligible findings against a complete causal catalog. Snapshot-index assignments preserve existing preventive invariants, join same defects and append independent incidents. Validate an entire batch before applying/checkpointing; canonical thread collapse and final complete coverage remain mandatory. Keep v6 findings, use a separate consolidation policy/input fingerprint and CLI-owned private atomic state, resume only validated prefixes, and never publish partial work. ADR0005 records the design and acceptance checks. Implementation is delegated in a new main-based worktree carrying PR17's owned dependency; no merge or full-history semantic endorsement yet.

## Issue23 — integrated bounded citation producer

Integrate PR22's owned80540d7 with PR20's artifact-coupled citation guidance and ADR0004 in a new main-based Worktrunk worktree; original worktrees and main stay untouched. Retain all21native smoke comments, two recurring rules, four unrelated singletons and the same-thread join across the16-finding boundary. Reconcile the helper with base/fix/unrelated-head SHAs numbered3n/3n+1/3n+2, the actual fix patch under fix, only README under head, and consistent reviewed/head sources. Assert these contexts reach actual classification and that consolidation receives its native schema.

Keep schemas, validators, v6 finding hashes, timeout controls and the immutable-catalog policy unchanged. The immutable invariant remains a known limitation, not corrected here. Run relevant checks once after edits and one native Claude Sonnet21case smoke. Record a separately packed/installed artifact's source commit, tar SHA and version; hand its executable to the parent for the complete Pi resume without starting that run. Open a draft PR linked to issues18/21/23; no merge, complete-history acceptance or root-quality conclusion follows from synthetic verification.

## Issue25 — revisable causal invariants

ADR0006 supersedes only the immutable-text part of ADR0005. In a new main-based Worktrunk branch, explicitly fast-forward owned dependency e0f55df9c998e79bced668c1e1fba1deec5f7627. Permit a referenced group's cause/prevention to inherit as null/null or be replaced as two nonempty marker-free strings; reject partial/blank/marker pairs before clone/save. Keep every old membership, snapshot reference, exact current coverage, canonicalization, privacy protection, independent-incident threshold, schema and provider flag unchanged.

Require one minimal preventive core supported by ALL old and new observed resolutions; refine a false case-specific hypothesis rather than append incident-specific clauses or generalize to a topic. No old-group repartition, explanation rewrite, second judge, repair or runtime gate. The actual instruction fingerprint naturally invalidates old consolidation policy state; unchanged v6 findings remain reusable.

Consumer checks cover paired refinement across the16boundary, retained old members, independent recurrence, correctly scoped publication and invalid-pair atomicity/resume. Extend the native fixture to23comments/22eligible: early session-refresh and late render-cache atomic generation-check-and-write defects add a third recurring mechanism; retain optional14IDs/13defects, index2defects, four singleton causes, praise exclusion, unrelated-head citation history, human preservation and zero-call repeat. Move the pre-fix same-thread reproduction to26/2600 to preserve the boundary.

Run focused checks once after edits, read the selective diff and open a draft PR closing25 with explicit blocked native/full-history acceptance. Do not call providers before the reported2026-11-16T02:30Z reset. Parent owns source-frozen native execution, separate installation, complete histories and causal review; no5/5or merge while any remain unverified.

## Issue29 — evidenced failed-repair recurrence

ADR0008 records the owner's explicit count_failed_repairs decision. It supersedes the earlier independent-original-defects-only convention, not causal cohesion, accepted-fix evidence or threshold2. Supply original current/catalog member chronology and relevant noneligible thread/review context with deduplicated shared source/patch tables. Keep capture and normalized finding schemas, v6 hashes, citation feedback, privacy, resource limits, exact coverage, snapshot references and paired refinement unchanged. New grouping instructions/context naturally restart stale grouping state; never rehash old experiments.

Per-call full source/patch payload belongs only to PRs in the current delta; keep all earlier/current captured artifacts within those PRs, including cross-file/pathless evidence. Retain all old member original causes, preventions, resolutions, evidence and comment chronology in the catalog, not old PR code. Complete grouping input identity remains batch-independent without inferring causal stages. This is consolidation of previously validated findings, not repeated full-code review. If active-PR complete evidence plus complete catalog/comments exceeds the existing explicit budget, fail before the call rather than truncate or assume the adapter's16MiB byte ceiling is model capacity.

Consumer checks preserve model-assigned same-thread repair lineage and duplicate memberships through equal timestamps, retained original anchors, additive/disjoint delegated repairs, incomplete metadata, existingIncidentIndex append, cross-batch snapshot references and zero-call resume. Negative unchanged/new-SHA/unrelated examples remain one under the supplied semantic assignment, not a mocked split-then-clamp guarantee. Preserve all23 native cases and26/2600 boundary; the4 new title-repair comments use an unchanged newly added caller, actual before/partial/final delegated-policy patches, caller-only original/head snapshots and an explicitly retained old reply anchor. Keep27 total/25 eligible, four recurring mechanisms and four unrelated singleton candidates. Real native judgment must join duplicate inline/review feedback, exclude the acknowledgement and retain the accepted definitely-not-sent fallback.

Run focused repository checks once after all changes, then open a draft PR closing29. Parent owns frozen native generation/installation, complete-history replay and independent actual review. Historical53 proposals require fresh judgment under the approved recurrence criterion; this policy change does not correct or endorse every proposal. No provider calls or main merge in this slice.

