# ADR 0002: Bounded classification batches and validated checkpoints

Status: accepted for implementation after the user selected batching and checkpoints before continuing the full real-history runs.

## Context

Complete live capture covered 249 PRs and 4,322 comments. The original analyzer repeated full PR context for each comment and persisted nothing until all classification and consolidation finished. A controlled diagnostic reached 160 successful model subprocess calls before the provider returned usage_limit_reached. Those calls did not yield a durable analysis. Both configured providers subsequently reported usage limits. More blind full-history retries would repeat work instead of curing the failure mechanism.

## Decisions

- Keep installed OMP, Claude Code and Codex adapters, isolation, exact citation/code-quotation checks, complete accounting and two-independent-incident promotion unchanged. No provider bypass, heuristic bot filtering, sampled history, truncated evidence, automatic retries or incomplete rule publication.
- Classify at most 16 pending comments per model call. Greedily pack sorted targets, including across PR boundaries when the complete distinct PR contexts fit maxInputBytes. Each distinct PR appears once per batch. A single target whose complete PR context exceeds the bound still fails explicitly. Preflight all pending batch inputs before the first model call; retain only compact batch entry lists, not all rendered prompts.
- Batch prompt DATA contains targets: [{prNumber,commentId}] and pullRequests: [complete captured PRs]. Model response is exactly {findings:[{commentId,...classificationFields}]}; every requested target appears exactly once. Unknown, omitted, duplicate IDs or invalid citations reject the batch before checkpoint callbacks. There is no single-result compatibility shim. Advance prompt version to invalidate the previous prompt contract.
- Preserve the existing complete Analysis/Finding schemas and complete previous-analysis reuse. Extend analyzeCapture options with optional async loadFinding(inputHash) -> Finding|null and saveFindings(findings) -> void callbacks. The analyzer owns identity/hash/reference validation; the CLI owns filesystem persistence. Only matching, fully validated findings may be reused or checkpointed. Checkpoint failure propagates and stops further processing.
- CLI checkpoints are independent atomic JSON files at .comment-to-code/findings/<inputHash>.json. Reuse safePath and atomicWrite. Directory mode 0700, file mode 0600; reject symlinks, malformed/mismatched entries, tracked private paths and ineffective ignore rules before private writes. Hash paths must be validated. One file per content hash avoids rewriting an ever-growing aggregate on every batch. No database, daemon, new runtime dependency or speculative cache framework.
- Persist successful batches before requesting the next batch. Save only findings, never partial groups/rules. Always reconsolidate all eligible current findings after complete classification; checkpoints are not extra incidents. Publication and analysis.json occur only after complete analysis validates, preserving previous successful documents on failure.
- Keep failed-run artifacts and original working checkouts untouched. Resume the two full real captures using a separately packed/installed candidate and real available provider. Judge promoted rules against independent incidents and observed fixes; existing human instruction content is not newly learned feedback.

## Ownership and shared contract

- Batch implementation owns src/analyze.js, test/analyze.test.js, test/analyze-memory.test.js and test/publish.test.js.
- Checkpoint implementation owns src/cli.js and test/cli.test.js; may add a filesystem-cache module only if it makes ownership simpler rather than abstracting a single use.
- Parent owns this ADR, docs/PLAN.md, docs/PROGRESS.md, README.md, integration, full installed-CLI verification, selective commits and PR review/merge.
- Agent adapters and publication API stay unchanged. Tests that provide classification responses migrate to the batch contract; do not pin prompt wording or retain old protocol aliases.

## Verification

Focused deterministic checks cover bounded batches, target coverage, PR-local evidence validation, context-sensitive reuse, memory bounds, interrupted-run resume without duplicate incidents, corrupt/unsafe checkpoints, and preservation of prior documents on incomplete runs. Use existing repository commands after implementation; no mid-flight broad suites. The parent installs the real package and completes the unchanged large captures through actual agent execution, recording successful checkpoints, later cache reuse and final documents separately from test fixtures. Independent contextual review and final CI precede merge.
