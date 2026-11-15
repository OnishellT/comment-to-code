# ADR 0005: Bound and checkpoint causal consolidation

Status: accepted design, issue21. Verification progress lives in docs/PROGRESS.md. Supersedes PR17's unbounded one-shot completion assumption, not its causal policy.

## Evidence

The real native nine-comment smoke passes. A complete609-finding call then returned a partial fenced object and an interactive request to regenerate or split the answer. Native end_turn/completed,128000 output allowance,22335 visible response bytes and47868 output tokens including39810 thinking rule out hard output truncation. Captured-response replay through the actual analyzer reproduces strict JSON rejection in seconds. Earlier complete one-shot outputs still contained topic buckets or duplicate provisional entries. Repeatedly strengthening prose does not bound the global planning/output workload.

## Decision

Consolidate at most16 new eligible findings per model call against the complete existing cause/incident catalog. Return only current-batch assignments: reference existing catalog group/incident indices or create new entries. Existing mechanisms/preventive invariants cannot be rewritten; every admitted finding's observed resolution must enforce the same invariant. Honor accepted alternatives and preserve unrelated singleton candidates. Catalog indices belong to one prompt snapshot, not persistent secondary IDs. Validate the entire response before applying it; reuse existing canonical group/thread protections afterwards and show fresh indices next time.

Existing group references inherit invariant text rather than echo or modify it. Existing incident references join the same defect; new independent incidents append. Captured thread identity also collapses across batches. Include complete catalog identity/explanation/PR/thread context and complete current findings within the explicit input budget. Pack fewer entries if necessary; fail before a call if even one plus the complete catalog cannot fit. Never truncate, sample, salvage partial output, retry models or add a semantic gate/judge stage.

Persist only validated whole-batch progress through analyzer callbacks. The CLI owns one private atomic `.comment-to-code/consolidation.json`, retaining tracked/ignored/symlink protections. State includes repository identity, a distinct consolidation policy/input hash, processed prefix and canonical groups. Validate all loaded state against current inputs; refuse malformed/cross-repository state, ignore valid stale policy/input state. v6 finding admission and hashes remain unchanged. A complete matching checkpoint avoids repeated model calls; incomplete state never publishes documents. Final full eligible coverage and threshold2 independent defects remain mandatory.

## Implementation and verification plan

Use a new main-based worktree with PR17's owned commits as an explicit dependency; a superseding PR must pass independent review and CI before merge. Parent owns decisions, integration, real installed replay and final causal judgment. No unrelated refactor or extra dependency.

Deterministic consumer tests cover cross-batch mechanism reuse, same-defect/thread joins, independent recurrence, rejected-batch atomicity, private resume, staleness and cache protections. Extend the existing native smoke beyond16 eligible findings: retain its nine cases; add eleven independent optional-collection fixes plus a same-thread reply at a batch boundary. Expected21comments, two recurring mechanisms (13optional-collection defects despite14comments;2index defects), and four unrelated singletons. Assert memberships and consumer outcomes, not wording or option wiring. Run focused checks and one actual native smoke after edits, then separately installed complete real-history analysis with all valid findings reused. No merge or learned-rule endorsement from small-fixture success alone.

## Native multi-batch verification found a separate format failure

The implementation passed96focused checks. Its first native21 attempt classified both batches, then the first16-finding consolidation emitted a draft placeholder object, correction prose and a second object with an extra field. Ordinary native completion,6642visible bytes and no quota error: strict rejection is again correct. Batching alone does not constrain the output channel.

Use native structured output for consolidation where the CLI supports it, retaining canonical validation for every backend. Confirmed local help exposes Claude `--json-schema` and Codex `--output-schema`; OMP exposes no equivalent flag, so its existing text transport remains strictly validated, not falsely described as constrained. Extend the agent resource owner with optional outputSchema, preserve all isolation/time/byte limits, use Claude's actual structured_output result field and Codex's owner-only temporary schema file/final-message contract. Missing/failed structured output must fail closed, never fall back to prose or repair text. Parent supplies the consolidation schema through the existing analyzer callback; finding semantics/hashes remain v6. Verify the real locked-down native transport before another21-case run. No safety-flag relaxation or provider-approval bypass.
