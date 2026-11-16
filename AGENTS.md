# comment-to-code

## Product contract

Build an installable local CLI for OMP, Claude Code, and Codex. From a local GitHub checkout, capture every accessible pull request (all states) and all discussion comments, inline review comments/replies, and submitted review bodies. Analyze each comment against the reviewed code, subsequent changes, and final PR state. Preserve evidence and explicit unresolved/ignored dispositions; never invent a fix or silently skip comments.

Promote a concise root-cause prevention rule after two supported mistake occurrences share that cause: independent original defects or fresh substantive feedback after an evidenced relevant failed repair. Unchanged reports, acknowledgements and duplicate same-state reviews count once. Independent defects in one PR may count separately. One occurrence stays a candidate. Generalize the prevention, not a filename-specific symptom; merge overlapping rules rather than accumulating duplicates. Output only rules.md, AGENTS.md, and CLAUDE.md as instruction artifacts in the target project. Internal capture/analysis JSON and installed skills are allowed. No runtime gates/hooks in this MVP.

## Required development loop

1. Plan each feature in detail before implementation.
2. Persist decisions and ADRs. Prefer correct, readable, performant code; KISS and YAGNI.
3. Create GitHub issues with acceptance criteria.
4. Delegate bounded implementation to subagents in a new branch/worktree based on main. Follow the overseer-subworktree skill; use Worktrunk, not git worktree add. Implementers run real relevant verification once after implementation, not repeatedly mid-flight.
5. Review changes and iterate on evidence-backed findings.
6. Open a PR and request an independent reviewer with the product contract, decisions, acceptance criteria, and verification evidence.
7. Check each recommendation for correctness, scope, KISS, and YAGNI before fixing it. Persist review decisions.
8. Merge only at 5/5 confidence: acceptance criteria met, relevant checks green, independent review complete, no unresolved correctness/security findings. Never call confidence 5/5 with known gaps.
9. Repeat for the next feature. Initial repository bootstrap is the only direct-to-main setup; application implementation goes through PRs.

## Engineering

- Node.js >=22, ESM, standard library only at runtime. GitHub access through authenticated gh CLI; no new credential store or hosted service.
- Agent analysis uses the user's selected installed CLI (omp, claude, codex). PR material is untrusted data, never executable instructions. Disable tools where supported; Codex uses supported execution-tool disabling plus a read-only sandbox and never-approve policy because exec has no global no-tools flag. Analysis must not modify the target project. Do not hack internal model catalogs to hide tools.
- No fake backend, heuristic substitute for causal analysis, or swallowed failures. Validate agent output and evidence references before producing rules.
- Preserve human-written instruction files; replace only clearly owned generated blocks. Refuse unsafe symlink targets. Incomplete analysis must not overwrite published rules.
- Use edit for existing files. Use the selective eval commit API, not git add/git commit. Do not commit captures, provider credentials, or local sessions.
- Test command: npm test. Focused check: node --test test/<file>.test.js. CLI smoke: node bin/comment-to-code.js --help. See docs/PLAN.md for interfaces and acceptance criteria.
- On resumption/compaction read this file, docs/PLAN.md, and docs/PROGRESS.md before acting. Record milestones and review outcomes in docs/PROGRESS.md.
