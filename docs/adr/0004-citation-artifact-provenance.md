# ADR 0004: Keep code citations within one captured artifact

Status: accepted contract clarification; issue18. Implementation and native verification precede merge.

## Observation

Two actual native responses on a complete real capture quoted real final-PR patch text but attached a different captured commit SHA. In one, the claimed commit did not change that file; in the other, a later unrelated head commit did not own the patch and its source did not contain the quoted diff marker. Existing strict validation correctly rejected both batches and preserved valid prior findings. Retrying the unchanged producer did not fix the reference/container confusion.

## Decision

Clarify the existing classification prompt: select an eligible captured artifact first and keep ref/path/quote together. A final PR file patch uses the PR URL; a commit file patch uses that commit's SHA; paired head source uses that source's ref/path and exact content without an invented diff marker. A head commit patch is not the whole final PR diff. Do not relabel text from one artifact with a neighboring/contextual reference.

This does not change schemas, evidence eligibility, exact matching, classification meaning, thresholds or v6 finding hashes. Preserve matching validated checkpoints. Do not repair returned citations, relax validators, add repository-specific exceptions, silently retry or add a second agent stage.

## Verification and integration

Extend the existing real-agent smoke history with a fix commit followed by a distinct unrelated head commit, while retaining the final patch and paired head source as legitimate alternatives. Successful classification must still pass the real validator and produce the expected recurring rule; do not pin which valid citation form a model chooses. Run existing focused evidence/analyzer checks and one native smoke after edits. Separately install and resume the unchanged complete capture, preserving prior failure evidence and judging eventual causal rules independently.

This worktree branches from main while PR17 is under real-history verification. It changes finding instructions and fixture commit history, not PR17's causal policy. Integrate main after PR17 before the final combined full-history candidate; resolve any shared smoke-helper edits without losing either semantic scenario. Independent review and final green CI are required before merge. Synthetic smoke success is not complete-history or nine-document acceptance.

## Observed verification

Existing analyzer/bounded-memory checks:34passed,0failures/skips. One actual native Claude Sonnet smoke accounted for3comments, confirmed both independently fixed defects despite their later unrelated head commits, produced1rule with exactly2incidents, ignored praise, preserved human instructions and published byte-identically on repeat. Both native code citations selected the final PR URL and exact complete changed line, an allowed artifact form. This is synthetic real-model verification, not complete Pi history or combined causal-policy acceptance.
