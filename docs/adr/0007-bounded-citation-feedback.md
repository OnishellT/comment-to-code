# ADR 0007: One bounded correction for rejected code citations

Status: implementation decision for issue27; real Pi and semantic acceptance pending.

## Evidence

Independent native Sonnet and Opus candidates cited the unchanged locating line in Pi's src/verify.ts as changed-code proof. The preserved offline replay rejected that candidate with zero provider calls or writes. The validator is correct; stronger-model resampling alone did not resolve the failure.

## Decision

Extract whole-batch classification validation and reuse it unchanged for both candidates. Only the existing failed code-citation predicate raises an internal typed error carrying the offending comment ID and validated ref/path/quote. Preserve the external Invalid analysis error prefix and all admission guards.

Eligibility is batch-wide: retain the first citation diagnostic while checking every remaining finding, citation object schema and exact final ID coverage. Any non-citation error stops without correction, even when an earlier citation failed. The existing deadline applies independently to each call; this is not a shared two-call deadline or a timeout retry.

On that error alone, allow one complete model-generated replacement. Supply the same entire PR contexts and targets, original response and diagnostic as untrusted JSON in the single final DATA object. Add correction instructions only on this turn: unchanged locating text is not changed-code proof; select actual supported changed evidence or retain uncertainty. Never repair output or coerce status. Validate the complete replacement before the existing single batch save. A second failure stops; previous valid checkpoints remain resumable.

Preflight the full correction with maxInputBytes without truncation. Transport, quota, deadline, parsing, schema, identity and other validation failures receive no correction. No loop, option, dependency, provider setting, consolidation change or publication bypass is introduced.

The first-pass prompt remains byte-identical and v6 eligibility/admission is unchanged. Already validated findings remain valid, so retain their hashes and reuse them without rewriting caches. Consolidation policy and fingerprint remain untouched.

## Verification

Consumer tests cover unchanged-source rejection followed by changed-proof acceptance and publication, failed second candidates preserving a valid prefix, non-citation failures without correction, uncertainty and correction input budgets. Run analyzer, memory, CLI and publication tests once after implementation. Controlled tests are not native verification: the parent owns the frozen-source real Pi resume and full semantic judgment. No accepted project documents, 5/5 confidence or merge is implied.
