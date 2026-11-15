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
- Independent review identified one P2 blocker: force-push during collection could combine old head/base metadata with equally sized new commit/file responses. Accepted as a real causal-evidence integrity defect, not speculative scope.
- New changed-snapshot regression failed before the fix (Missing expected rejection). Capture now rechecks head/base, updated timestamp, lifecycle, and counts after evidence collection and rejects differences. No retries or partial publication. Capture plus CLI tests passed 21/21 after fix.
- Focused independent reassessment: overall correctness correct, confidence 0.96, no unresolved reviewer blockers. Parent's focused checks are green; 5/5 merge confidence remains conditional on final CI.

## Current milestone

PR #4 merged as f8bc3b6; scoped producer-contract issues #5/#6 merged through independently reviewed PR #7 as b77b201, with 71-test final CI green. User then explicitly approved batching and validated checkpoints before continuing the two incomplete large-history runs. Issues #8/#9 and ADR 0002 define the next main-based worktree loop; no full three-repository completion is claimed.

## Issue #5: Literal evidence-reference contract

- Complete-history provider runs exposed evidence entries combining captured references with prose. Exact-reference rejection was correct; the producer prompt, not validation, needed clarification.
- Prompt v3 requires unchanged literal captured URLs or commit SHAs, forbids explanation/Markdown inside evidence entries, and explicitly permits empty evidence for ignored non-actionable findings. The version change invalidates old finding caches. Citation, code-quote, accounting, and incident validators are unchanged.
- Focused analysis, bounded-memory, and publication checks passed: 33 tests, 0 failures. No prompt-wording assertions were added; existing malformed-reference consumer tests retain rejection coverage.
- One real Claude replay of the unchanged complete failing capture passed literal-reference validation and published a legitimate empty rule set. Review still found a substantive rejected-approach discussion classified as administration: formatting success is not full causal-quality acceptance, and no corrective retry was made.
- That disposable checkout required an explicitly approved instruction-symlink-to-regular-file fixture normalization with identical human bytes. Publisher symlink refusal remains unchanged; this replay does not establish publication compatibility with the unmodified checkout.

## Issue #6: Technical content inside workflow comments

- The real prompt-v3 replay retained complete accounting but lost a substantive rejected-implementation discussion by classifying its workflow wrapper as administration. That artifact and report are preserved; passing literal-reference validation did not establish semantic correctness.
- Prompt v4 distinguishes pure workflow notices and defect-free walkthroughs from explicit technical failures, safety gaps, and rejected implementations. Supported cause, prevention, and resolution/disposition remain available for non-confirmed technical findings; rejection and unmerged state do not prove a verified fix or recurrence. Strict validators remain unchanged.
- A separate packed/installed v4 candidate used the same unchanged complete capture, no previous analysis cache, and the same explicitly approved disposable-checkout symlink normalization. The one actual Claude-default replay exited 1 at the subprocess boundary before accepted findings or publication. The CLI retained only its generic failure message; private provider stderr was not persisted. This is a provider-execution failure, not a v4 classification result.
- The parent explicitly authorized one controlled alternate-backend replay with actual OMP and `openai-codex/gpt-6.1-sol`, using the same v4 source and unchanged complete capture. It succeeded with complete accounting: pure summaries/notices remained administrative, and the substantive rejected implementation retained a defect/ignored disposition with supported cause, prevention, and rejection explanation. No verified fix, candidate, or recurring rule was invented.
- Human instruction bytes were preserved with managed blocks appended. Original and v3 artifacts, captures, reports, and generated documents remain unchanged. The candidate-only link normalization means unmodified-checkout publication compatibility is still not established.
- Final focused analysis, bounded-memory, and publication checks passed once: 33 tests, 0 failures. The actual alternate replay provides the semantic evidence for this history; these structural tests are not a substitute for provider judgment.
- Parent inspected the substantive finding and endorsed its retained rejected-approach explanation, not a promoted rule: the captured history does not establish two independent verified fixes. An actual cached CLI rerun reported 29 cached, 0 newly analyzed, 0 rules/candidates; all three Markdown document hashes remained identical.

## Issues #8/#9: Bounded and resumable classification

- Complete original live captures cover 249 PRs and 4,322 comments. One corrected complete small-history run generated a legitimate empty rule set and retained substantive rejected technical concerns; larger runs remain incomplete.
- A privately instrumented complete-history replay made 160 successful model subprocess calls before an explicit usage_limit_reached error on the next call. The failed prompt was 27,996 bytes: this observed blocker was quota, not context size. No partial findings survived the old all-or-nothing analyzer.
- A separate synthetic Claude availability probe also returned 429/usage_limit_reached and a provider reset time. No account settings, purchases, safety bypasses or hidden quota workarounds were attempted.
- User selected the recommended architectural correction: bounded batches and private validated-finding checkpoints before further retries. Preserve exact evidence validation, all-comment accounting, two independent incidents and complete-only publication.
- Main-based Worktrunk branch feat/batch-checkpoint-analysis owns the implementation. BatchClassification owns the analyzer and its protocol fixtures; CheckpointPersistence owns CLI persistence/tests; parent owns shared contracts/docs, integration, installed real runs and contextual PR review.
- Original working checkouts and all prior failure evidence remain untouched. Final project document sets are separate; retained human instructions, including subagent policies, are not newly learned rules.
- Implementation is complete with no new dependencies or compatibility shim. Analyzer-focused checks passed 42 tests; CLI checks passed 27 tests after correcting an unsupported Git argument exposed by the first CLI run. These use fixture transports, not live-provider evidence.
- Parent integrated verification: npm test passed 101 tests, 0 failures, 0 skips. The consumer-level interruption test retains 16 validated findings, resumes only 2 missing targets and publishes 18 findings as two independent incidents rather than 18 duplicate defects. Invalid batches, corrupt/symlinked/tracked/unignored checkpoint writes and prior-document preservation are covered.
- Installed-candidate full-history execution and independent contextual PR review remain pending; the original nine-file user request is not yet complete.
- PR #10 at 394658b passed GitHub test check 43711173312. Independent contextual source review found no concrete introduced blockers, but withheld end-to-end acceptance pending real-provider verification.
- The separately installed artifact executed both complete large captures with the real Claude CLI; actual model was claude-sonnet-5-5. Both stopped safely on code quotations that omitted literal changed-line markers. Five invalid quotations were exact patch substrings but not eligible diff-line quotations; no validator was weakened or output repaired.
- The partial larger run retained 35 validated findings in a 0700 directory with 0600 files. No incomplete analysis or generated documents were published; the other replay's human CLAUDE.md remained byte-identical. This is real durable-progress proof, not complete-history success.
- Issue #11 adds generic literal-marker/indentation examples without changing the v5 schema, eligibility or cache contract. Focused analysis checks passed 31 tests after correcting an initial regression-case assumption: a marker-free quote can legitimately qualify through paired head-source evidence, so the rejection case now uses a removed-line fragment absent from head source. Installed resume and follow-up review remain pending.
- Actual revised installed resume reused all 35 prior pi findings, then saved 80 more; thereelcapital saved 112. Both later stopped on captured reviewed-commit references absent from the validator's contextual allowlist. These SHAs were present in typed originalCommitId/source-ref fields; calling them fabricated was an implementation bug, tracked as #12.
- Contextual references now include captured typed base/head, original review commit and source refs. Eligible fix changes and exact quote validation are unchanged; baseline-only and prose-invented references still cannot establish a fix. The same two preserved real provider responses failed before this correction and validated all 16 targets each afterward in a no-write replay. Focused analysis checks passed 32 tests.
- Existing validated v5 findings remain compatible. A separate installed replay, final CI and incremental independent review are required before PR #10 merge; neither large repository is complete yet.
- Issue #13: the next real replay reused 112 findings and advanced to 144 before rejecting an exact added Markdown-list line. A two-sign regex confused changed content with headers. Changed lines now come from hunk bodies; citations must match those actual changed-line prefixes, while headers/context-only fragments remain ineligible. Focused analysis/memory checks passed 34 tests on final v6 source.
- The preserved failing native batch rejected under installed v3 and validated all 16 targets with the structural correction in a no-write replay before the validation-epoch change. No quote was normalized.
- The stronger hunk check also excludes old context-fragment false positives. Validation epoch v6 therefore invalidates v5 findings, whose original code quotations were not persisted. Actual cache check: v5 reused 144/407 findings, v6 reused 0/0, with zero provider calls. Historical files remain intact; their existence is not current validated progress.
- A complete real Claude semantic smoke using the structural validator passed: 3 comments, 1 general optional-collection normalization rule, 2 independent defects, praise excluded, human instructions preserved and repeat publication byte-identical. This is a synthetic review fixture with real model execution, not either large repository's completion.
- The longer real pi replay stopped at 407 historical findings on an explicit Claude five-hour usage limit, resetting 12:30pm America/Santo_Domingo (16:30 UTC). No further generation was attempted against that exhausted provider. Current-epoch full-history completion and nine deliverable files remain pending.

## Issue #14: Native Codex large-prompt transport

- PR #10 merged after independent review and 103 passing CI tests. The nine-file customer request remains incomplete; current-epoch complete large-history output is still required.
- Read-only native Codex account/model discovery showed available existing quota and supported gpt-6.1-sol. No login, credential rotation, purchase or account change was performed.
- Both actual installed v6 full-history runs failed at the unchanged 64 KiB stderr guard. Termination-safe private instrumentation confirms native Codex v0.167.1's human formatter prints its startup header, then the full user prompt into stderr. No rules or complete analyses were published.
- Main-based Worktrunk branch fix/codex-machine-output owns the minimal transport correction and regression. Complete captures, historical checkpoints and original working checkouts remain untouched. Verification, installed replays and independent PR review are pending.
- The new large-context regression failed with the same stderr-limit error before the one-flag correction. After selecting exec --json, all 13 focused adapter tests passed, including exact final-file extraction with the full large input and unchanged oversized-stderr rejection.
- A separate packed/installed candidate is running both unchanged complete captures with native Codex. This live verification is pending; no completion or generated-rule quality is inferred from the focused fixture tests.
- The actual machine-mode replay no longer echoes the large prompt to stderr. One native Codex call instead reports its explicit 1,048,576-character turn input limit (actual input 1,768,622). A zero-provider-call complete-context measurement finds three individual PR contexts above that limit in this capture, so smaller batch packing alone cannot complete it with native Codex. No evidence was truncated or hidden. The other actual replay is still pending.

## Issue #16: Causal consolidation acceptance

- PR #15 merged at ed46079e3262ec176693d5610e8721797bc264d4 after independent review found no introduced issues and CI passed 105 tests. Native machine transport progressed through actual large-history analysis; no safety/resource setting was weakened.
- Native Codex completed 1,879 current-v6 findings before its explicit usage limit. Two model copying failures and an identical failed resume remain preserved; operator model changes/resumes are disclosed, not presented as uninterrupted success. No further generation against the exhausted native Codex account was attempted.
- After the stated Claude reset, the complete large history finished with 2,232 accounted comments, 609 eligible findings, 33 proposed rules and zero singleton candidates. Existing 9,934-byte human instructions were preserved byte-for-byte as a prefix. This is complete execution, not semantic approval.
- Parent rejected the generated consolidation: unrelated naming, dependency and type-safety defects became one topic-wide rule; index access paths, historical foreign keys and lifecycle migration state became another. The exact complete output is archived privately and a concrete separation assertion fails. Do not endorse it or edit the generated rules to conceal the failure.
- Another complete history has 252 validated current-v6 findings, then stopped on a model citation that used a different captured commit than the actual quoted patch. No invalid rows were salvaged and no partial rules published.
- Main-based Worktrunk branch fix/causal-consolidation owns the correction. Classifier findings remain valid under v6; only grouping instructions and the opt-in real-agent semantic smoke change. Implementation, semantic verification, complete cached replay and independent PR review are pending.
- Delegated implementation changed only the consolidation prompt and existing native smoke. Focused analyzer/memory checks passed 34 tests, zero failures/skips. Parent read the actual logs and reviewed the diff.
- One actual native Claude Sonnet smoke accounted for seven comments: optional-collection IDs1/2 and index-access IDs4/5 form two separate promoted rules with exactly two independent incidents each; foreign-key ID6 and lifecycle ID7 remain two separate singleton candidates. Praise is excluded, human instructions preserved, repeated publication byte-identical. This synthetic semantic success is not full-history approval.

## Issue19 — causal replay runtime dependency

- PR17 headf3ed453 passed105 CI tests and independent source review (no introduced actionable findings, confidence0.96), but full-history semantic acceptance is still outstanding.
- Its installed cached real-history reconsolidation failed explicitly at300000ms; old complete analysis/documents remain, and no canonical delivery was replaced. This is not a successful semantic replay.
- Added an explicit per-agent-call timeout override for `analyze`/`run`, preserving the default and all other resource/isolation/evidence protections. The actual CLI/timed-subprocess scenario first failed because the flag was unavailable; all27 focused CLI checks now pass, including safe timeout, successful bounded completion and invalid numeric values. Removed the old wiring-only option-object assertion rather than pin the extra optional field. A separately installed longer-bound full-history replay and incremental review/CI remain required.

## Resolution-grounded causal iteration

- The longer-bound native real call completed after about501seconds but returned146groups/365rawincidents/610memberships for609unique IDs. Strict validation rejected one duplicated ID in a placeholder group before publication.
- Independent audit inspected all146 cause/intervention pairs and all609 constituent causal/resolution fields, plus selected source fixes. It found systematic topic buckets and incompatible/opposite remedies beyond that duplicate; no salvage or unchanged retry is justified. Private report: thereelcapital-causal-raw-audit.md.
- Further producer guidance compares each observed resolution with the shared preventive invariant, preserves accepted alternatives and requires that causal connection in incident explanations. The existing smoke now adds two independent simulator defects in one PR/file, expected as separate singletons (nine comments total, two recurring rules, four candidates). No schema, validator, cache epoch or pipeline stage changes.
- Existing focused analyzer/memory checks passed34tests with zero failures/skips. The new native nine-comment scenario and complete real reconsolidation are not yet verified: native Claude has explicitly exhausted its five-hour allowance; OMP/Codex are also exhausted. No generation before the reported reset, no account/billing workaround, and no 5/5 or merge claimed.

## Issue21 — post-reset diagnosis and bounded consolidation

- Native nine-comment smoke passed after the observed reset: two recurring rules, four unrelated singleton candidates, praise ignored, human content preserved and publication idempotent.
- The complete609-finding native call completed in337010ms but returned22335visible bytes containing partial fenced JSON plus a follow-up question. Native completion/end_turn with128000output allowance,47868output tokens including39810thinking, and the explicit admission of missing assignments rule out hard output truncation. The actual analyzer rejects the captured response; no parser repair or incomplete publication.
- Prompt-only one-shot iterations are not a reliable full-history design. Issue21 and ADR0005 specify bounded catalog assignments with validated-batch checkpoints, unchanged v6 findings and final full coverage. PR17 is draft, not approved for merge; the superseding branch feat/bounded-consolidation starts from main and carries its owned dependency.
- Implementation and actual native multi-batch verification are delegated. Complete real Reel and Pi analysis, independent causal judgment and nine-file delivery remain open.

## Bounded implementation and native format iteration

- Bounded catalog/state implementation passed96focused consumer tests. Independent state/resume/privacy/coverage review found no actionable bugs (0.88confidence), explicitly excluding native-format and complete-history acceptance.
- The first actual native21 attempt classified two batches successfully, then returned draft placeholder JSON, correction prose and a second object with an extra existingIndex key for the first16-finding consolidation. Strict rejection preserved the absence of publication; no quota error, truncation, salvage or unchanged retry.
- Local native help confirms Claude --json-schema and Codex --output-schema. Parent supplies the exact consolidation output shape and fingerprints it separately from unchanged v6 findings; delegated resource-owner work adds native result extraction/private schema-file handling without relaxing security flags. OMP retains text plus strict canonical validation, not a false native-format guarantee. A locked-down native microprobe precedes another integrated21-case verification. Full real609/Pi output and merge confidence remain unproven.

- Locked-down native schema microprobe passed: competing prose/drafts returned one typed object without safety-flag changes. Integrated focused tests passed96/96. The next native21 run returned two valid bounded consolidations, but its reply fixture merely confirmed an already-fixed issue and was reasonably classified administrative:19eligible, not the intended20, so the native echo assertion failed before publication. Preserve that failure. Change only the fixture reply to an explicit pre-fix reproduction in the same thread; retain every membership/count assertion and the20eligible target. No classification-policy/hash change, manual status override or weakened test.

## Integrated native bounded verification passed

- With the explicit pre-fix duplicate report, actual native Claude Sonnet completed21comments/20eligible findings in two consolidation calls. Exact results: optional-collection rule14comment IDs/13independent defects, index rule2defects, four unrelated singleton candidates, praise ignored. The second batch joined the reply to the original captured-thread defect. Human instructions survived; complete checkpoint replay made zero model calls and reproduced byte-identical documents. Evidence remains private in bounded-structured-echo-native.log.
- At this milestone, parent integrated focused checks passed96/96 and native transport checks passed33before minor assertion cleanup; complete real-history replay, current-head CI and causal judgment were still pending. Subsequent installed Reel execution and its rejected causal output are recorded below; synthetic success was not5/5or merge acceptance.

## Issue23 — integrate citation and bounded producers

- New main-based Worktrunk branch feat/integrated-evidence-producer fast-forwarded the owned80540d7 dependency. An incomplete owned38e0451 cherry-pick conflicted in the shared smoke helper and was aborted before reapplying that tiny delta with edit/write; main and both existing worktrees remain untouched.
- Issue23 links issues18/21 and integrates PR20's producer-only citation paragraph/ADR0004 with PR22's bounded catalog, native schema transport and timeout option. The shared smoke retains all21comments, exact2rules/4singletons and cross16boundary same-thread membership, with separate3n/3n+1/3n+2 base/fix/unrelated-head identities and assertions on actual delivered context.
- Verification: npm test passed150tests,0failures/skips. One real native Claude Sonnet run (actual claude-sonnet-5-5) passed21comments/20eligible findings,18distinct unrelated-head PR contexts and two schema-constrained consolidation calls (16then4findings). Exact2rules/4singletons and the same-thread boundary join passed; human content remained intact and zero-call checkpoint resume reproduced byte-identical documents. Both raw consolidation envelopes report success and structured_output; private evidence is integrated-native21.log. This establishes synthetic execution only, not real-history causal quality.
- Separately packed/installed version0.1.0 from source4ace8c9fa620d5836f64fcc36496dd8cf3350509: tar SHA25639f7a9b9aa38c6f1660259d2d68fad8ac5328e755ab1dd198c0cd1ebaf081376. New private package-integrated/tool-integrated roots retain the artifact and manifest. Actual installed --version/--help passed, including --agent-timeout-ms; installed analyzer/agent/CLI bytes matched source. The parent owns the complete Pi launch with this executable; none was started here.
- No Pi run, checkpoint mutation, merge, accepted project documents or full-history causal-quality claim is part of this slice. Immutable catalog invariants remain a known limitation.

## Subsequent full Reel evidence — structural completion, causal rejection

- Parent reports the separately installed80540d7 Sonnet full Reel run completed in1310.14seconds:2232cached/0new findings,609eligible findings,39bounded consolidation calls,45proposed rules and201singleton candidates. This establishes complete structural execution on that source, not causal acceptance of its proposed rules or verification of the integrated artifact's complete history.
- Parent rejects the query-pagination/filter/order bucket and requires revising the invitation-specific invariant reused for disconnect cleanup. The full45rule causal audit remains live; immutable catalog text is a demonstrated limitation, not a corrected policy in this integration.
- The installed full real-cache repeat passed through the actual CLI consumer with a throwing backend guard:0model calls, all3Markdown hashes identical and the9934byte human instruction prefix preserved. Private evidence: thereelcapital-bounded-complete-cachecheck.log. Parent reports80540d7 CI150passed/0failed/0skipped. Integration PR24 CI also passed on evidence-only8f25064ae417afe45b8fb197cfd440064c7f8ce1 (run43773048652).
- A separate-clone full-corpus Opus comparison is live. Complete Pi execution remains parent-owned; no Pi launch here, accepted Reel output, causal endorsement,5/5or main merge is claimed.

## Integrated PR review

- Independent contextual PR24 review at0233b33 found no introduced actionable source/integration bugs (confidence0.95), excluding semantic rule endorsement and complete integrated Pi execution. The native success proves its chosen citations, not exhaustive exercise of every allowed citation form.
- Parent accepted the reviewer's KISS recommendation to remove constructor-echo SHA/field assertions from the native callback. The unrelated-head fixture, delivered-context accounting, strict citation validation and all causal membership/count/resume expectations remain unchanged. Runtime source and the frozen installed4ace8c9 artifact are unchanged; no additional provider generation is implied.
