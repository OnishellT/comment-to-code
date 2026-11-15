# ADR 0001: Local evidence pipeline, no enforcement layer

Status: accepted for MVP.

## Context

Repeated review feedback is useful only if comments are interpreted with their code and resolution. Prompt-rule-to-hook tools researched earlier solve the opposite end of the lifecycle; integrating them now would add no value to capture and root-cause learning.

## Decisions

- Ship a zero-runtime-dependency Node.js >=22 ESM CLI using the authenticated gh executable. Install with npm; provide a local installer and project-local skills for OMP, Claude Code, and Codex. No automatic network writes to the analyzed GitHub repository.
- Separate capture, analysis, and publication. Persist versioned local JSON under .comment-to-code; capture remains usable offline. Do not publish rules if capture or analysis fails. Use explicit schema validation, not a package framework.
- Enumerate every PR state and paginate all comment/review/commit/file endpoints. Capture issue comments, inline review comments (including replies), and review bodies. Empty bodies get an explicit disposition; no hidden limit to recent PRs. Preserve comment edits and source IDs/URLs. Report partial/inaccessible context instead of inventing it.
- Gather original diff hunks, PR base/head and lifecycle metadata, per-commit metadata and patches, and final PR file changes. For relevant inline paths, capture reviewed and final source text when available. Binary, deleted, inaccessible, or GitHub-truncated patches must be marked unavailable. An unavailable fix cannot support a confirmed rule.
- Perform model-based causal interpretation using the selected installed agent CLI, without tools, from an isolated temporary directory. Never execute PR text. Constrain output to JSON, validate every source reference, and cap individual subprocess time/input with explicit errors rather than silent truncation.
- Classify every captured comment once per evidence version. Categories: defect, suggestion, question, praise, administrative, unresolved. Record cause, resolution evidence, prevention, and confidence where applicable. Only confirmed, evidence-backed defects/suggestions enter root-cause consolidation. Every other comment remains accounted for.
- Consolidate causes with a second model pass over concise findings. Each incident carries source comment IDs. Repeated comments about the same defect must be collapsed; replies in one review thread cannot independently satisfy the threshold. Independent defects in one PR may count. Two independent incidents are the promotion threshold. Single incidents remain candidates. The validator checks membership, uniqueness, coverage, and the threshold; semantic judgment remains model-based, not a claimed deterministic proof.
- Keep one canonical rule body in rules.md. Publish matching managed blocks in AGENTS.md and CLAUDE.md that direct agents to rules.md, preserving all human content. Use conventional uppercase agent filenames because agents discover those on case-sensitive systems. Stable rule identifiers, evidence URLs, and stored analysis prevent rule multiplication and permit reruns.
- No hooks, commit gates, daemon, database, vector store, remote service, or dependency on guardrail products in this MVP.

## Consequences and risks

All-history capture can be expensive. Cache capture and validated per-comment findings by content hash, use sequential requests by default, and avoid concurrent provider bursts. Explicit input limits may require raising a configured bound for large PRs; never silently discard evidence. Selected model providers receive the captured PR material when analysis runs; document this clearly. Agent CLI versions and model quality vary; strict validation cannot prove semantic correctness. Rule evidence and dispositions must remain auditable. Review final published rules before trusting them.
