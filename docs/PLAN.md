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

`Comment = { id: string, kind: 'discussion'|'review'|'inline', body: string, url: string, author: string|null, createdAt: string, updatedAt: string, threadId: string, path: string|null, line: number|null, originalCommitId: string|null, diffHunk: string|null }`. IDs include type to avoid cross-endpoint collisions. Inline replies share the root comment's threadId. Review/discussion identifiers must not collide. Empty review bodies are captured as comments for accounting.

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

`runAgentPrompt(agent, prompt, { model, timeoutMs = 300000 } = {}) -> Promise<string>` supports exactly omp|claude|codex. Create temporary isolated cwd outside the project; disable tools, skills, project instructions, extensions/MCP where supported. No permission/sandbox bypass flags. Send prompt via stdin, never argv/shell. Use ephemeral sessions and remove temporary artifacts. Capture stderr for actionable errors without leaking auth. Parse provider envelopes in runner; analyze.js validates model JSON. OMP text mode; Claude JSON result envelope; Codex final output file. Explicitly document limits of provider isolation; never claim a sandbox that is not configured.

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
