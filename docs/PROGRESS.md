# Progress

## Bootstrap

- User authorized public GitHub repository OnishellT/comment-to-code and the full issue/worktree/PR/review/merge workflow.
- Empty folder initialized on main; origin created at https://github.com/OnishellT/comment-to-code.
- Product contract, shared APIs, ADR 0001, and durable agent workflow written before implementation.
- Decision: two independent incidents, not two replies about one defect; independent defects in one PR can count separately.
- Bootstrap committed as ff0bc16267 and pushed to main.

## Implementation

- GitHub issues created: #1 capture, #2 causal analysis/publication, #3 installable CLI/agent runtime.
- Worktrunk created /home/dev/projects/comment-to-code.feat-pr-learning-mvp on feat/pr-learning-mvp from main (primary checkout, top-level worktree).
- Implementation delegated concurrently to CaptureEvidence, AnalyzeRootCauses, and CliAgentRuntime with non-overlapping file ownership and shared contracts.
- Parent added local-artifact ignores, Node 22 CI, and an opt-in real-agent smoke command using synthetic reviewed-code evidence. Fixture subprocess tests are not counted as provider verification.
- Shared identity helper settled as identifyProject({cwd,runGh}) -> {repository,cwd:absoluteGitRoot}; ambient GH_REPO/GH_HOST must not redirect capture.
- Capture contract refinement: own pending reviews can lack submitted_at. Keep their bodies, null timestamps, review state/commit ID, and an explicit limitation rather than fabricating a submission time.
- Codex exec has no global no-tools flag. Accepted supported boundary: isolated temporary cwd, ignored user config/rules, disabled optional execution tools, read-only sandbox, never-approve policy. OMP/Claude disable tools directly. No internal model-catalog hacks; residual tool availability is documented.

## Verification evidence

- CaptureEvidence completed its owned files; reported node --test test/capture.test.js: 14 passed, 0 failed. Parent inspected capture code and tests.
- Parent live GitHub capture against OnishellT/comment-to-code succeeded: correct repository identity, 0 PRs / 0 comments at this pre-PR stage. This proves live authentication/identity/empty-history capture only; nonempty history will be exercised after PR creation.
- Analysis/publication implementer reported 32 focused tests passed; CLI/runtime/installer implementer reported 23 passed. Parent integrated npm test: 69 passed, 0 failed.
- Parent packed and installed the npm artifact into a disposable prefix: actual --help, install --agent all, live capture, and empty-history analyze succeeded; all three skills and instruction artifacts existed, and private JSON was ignored.
- First real-provider fixture exposed ambiguous status semantics: OMP and Codex called high-confidence praise confirmed. Validation rejected it before publication. Prompt v2 explicitly reserves confirmed for verified defect/suggestion fixes and separates category confidence; no validation was weakened.
- After prompt clarification: 32 analysis/publication checks passed. Real OMP (openai-codex/gpt-6.1-sol), Claude Code (default), and Codex (default) each classified 3 comments into 1 preventive rule backed by 2 incidents, preserved human instructions, and published idempotently.
- Package remains UNLICENSED until the owner chooses a license; making the repository public was not treated as authorization to grant MIT rights.
- Real Codex isolation probe requested creation of a file in a disposable target workspace; no file was created. This proves the tested target was unchanged, not universal sandbox correctness.
- PR #4 opened from feat/pr-learning-mvp to main. Independent MvpPrReviewer received the product contract, ADR, acceptance criteria, actual code, and all verification evidence.
- Live nonempty capture against PR #4 succeeded: 1 PR, 2 discussion comments, 1 commit, 23 changed files, no limitations.
- GitHub Actions test check succeeded on 61b76b34f2. CodeRabbit skipped automatic review because the repo has fewer than 10 stars; it is not counted as reviewer approval.
- Measured review-stage memory defect: eager per-comment full-PR prompts exhausted a 48 MiB heap on 128 comments with 512 KiB context. Regression failed before fix. Minimal patch discards preflight strings and constructs only the current prompt; preflight validation remains. node --test test/analyze-memory.test.js test/analyze.test.js passed 23/23 after fix.

## Current milestone

PR #4 is open; the independent reviewer is evaluating it. Commit/push the measured memory fix, resolve justified review findings, record decisions, require green final CI, and merge only at 5/5 confidence.
