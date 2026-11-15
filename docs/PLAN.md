# MVP: Learn preventive rules from PR history

## Scope and success

A user inside a local GitHub checkout can install comment-to-code and its agent skill, capture all accessible PR discussion/review history, analyze every comment with OMP/Claude Code/Codex, and generate a small evidence-backed rules.md plus non-destructive AGENTS.md/CLAUDE.md references. Promotion requires two independent incidents with the same verified root cause. No gates/hooks.

## Feature issues / independent ownership

1. Capture GitHub evidence: src/capture.js and test/capture.test.js. Own pagination, identity, lifecycle metadata, comments/reviews/replies, commits/patches, reviewed/final code, explicit context limitations. No CLI/analysis changes.
2. Analyze causes and publish rules: src/analyze.js, src/publish.js, test/analyze.test.js, test/publish.test.js. Own validated comment classifications, root-cause consolidation, independent-incident threshold, candidates, managed Markdown blocks. No capture/runtime changes.
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

`Analysis = { version: 1, repository, analyzedAt, findings: Finding[], groups: Group[], rules: Rule[], candidates: Group[], stats: { comments, analyzed, cached, rules, candidates } }`.

`Finding = { commentId, prNumber, category, rootCause: string|null, prevention: string|null, resolution: string|null, evidence: string[], confidence: 'high'|'medium'|'low', status: 'confirmed'|'unresolved'|'ignored', inputHash: string }`.

Evidence references must resolve to captured comment URLs, PR URLs, or commit SHAs; confirmed findings require actual captured fix/code evidence, not merely a model assertion or thread-resolution flag. Non-actionable and unresolved comments remain explicit findings. Every captured comment appears exactly once. The model must distinguish rejected/outdated suggestions from verified fixes. A closed unmerged PR is not proof of a fix; open unresolved comments cannot support confirmed rules without observed changes.

`Group = { id, rootCause, prevention, incidents: { id, commentIds: string[], explanation: string }[] }`.

`Rule = { id, rootCause, instruction, incidentCount, commentIds: string[], evidence: string[] }`.

The consolidation pass partitions all eligible findings exactly once into root-cause groups and independent incidents; no invented/reused comment IDs. A review thread counts at most once per group, even if the model returns several incidents. Collapse overlapping incidents before applying threshold. Stable IDs derived from normalized content, deterministic ordering. Invalid/omitted/unknown/duplicate references fail analysis without publication. Prior groups are not an additional source of incidents; rerun consolidation on current validated findings so reruns cannot inflate counts.

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
- Analysis fixtures prove every-comment accounting, two independent incidents → one rule, one incident/replies → candidate, distinct defects within one PR, evidence validation, cache invalidation, malformed output, uncertain/rejected fixes, and no duplicate rules on rerun.
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
