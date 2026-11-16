# comment-to-code

Learn concise, evidence-backed prevention rules from a GitHub project's pull request history. Two supported mistakes with the same root cause promote a rule; one stays a candidate. Independent original defects and fresh substantive feedback after an evidenced failed repair count. Unchanged reposts, acknowledgements and duplicate reviews of the same code state count once. Unresolved, ignored, and non-actionable comments remain auditable in local JSON.

## Install

Requires Node.js >=22, Git, authenticated [GitHub CLI](https://cli.github.com/) (`gh auth login`), and an authenticated installed `omp`, `claude`, or `codex` CLI. There are no runtime npm dependencies or npm install scripts.

From this source checkout:

```sh
npm install -g .
# Or: ./install.sh (runs npm install --global --ignore-scripts; no sudo/download script)
```

Use a user-writable npm prefix if your global prefix requires administrator access. Then, in the GitHub checkout to analyze:

```sh
comment-to-code install --agent all
comment-to-code capture
comment-to-code analyze --agent omp --model openai-codex/gpt-6.1-sol
# Or capture and analyze in sequence:
comment-to-code run --agent claude
comment-to-code run --agent codex --model gpt-6.1
comment-to-code --help
```

`install` defaults to all; select `omp`, `claude`, or `codex` to install only that skill. Files are `.omp/skills/comment-to-code/SKILL.md`, `.claude/skills/comment-to-code/SKILL.md`, and `.agents/skills/comment-to-code/SKILL.md`. Existing unmanaged/modified skills and symlinks are refused. No hooks, gates, agent configuration, or credentials are installed. Nested-directory commands use the checkout root.

## Privacy, cost, and failures

Capture reads **all accessible PRs in all states**, discussion/review bodies, inline replies, commit patches, and relevant reviewed/final source through `gh`. It does not write to GitHub. All-history capture and model analysis can be slow and expensive: there is no implicit recent-history cap. Inaccessible or truncated context is recorded explicitly, not invented.
PR metadata is rechecked after evidence collection; detected head/base, lifecycle, timestamp, or count changes abort capture rather than persisting mixed snapshots. GitHub API caps fail explicitly instead of silently dropping history.

**Analyze transfers captured private repository material to the model provider selected through your installed agent CLI.** Only run it when authorized to share that material. Provider retention/billing policies apply. Prompts and private stderr are not printed by default. Local `.comment-to-code/capture.json`, `analysis.json`, `consolidation.json`, and `findings/<inputHash>.json` checkpoints may contain private code and comments. The cache directory is owner-only, and a scoped root `.gitignore` entry is established and checked before private writes. Already-tracked caches, symlinks (including ancestor paths), malformed/cross-repository caches, and captures older than 30 days are refused. Recapture to refresh stale evidence. Gitignore is not encryption or access control against other processes under your account.

Classification batches contain at most 16 pending comments and complete distinct PR contexts that fit `--max-input-bytes N` (default 1 MiB per model prompt); evidence is never silently truncated. Consolidation assigns at most 16 eligible findings per call against the complete existing causal catalog, preserving all memberships and deduplicating same-defect replies across batches. Existing cause/prevention text may be refined together only to one minimal preventive core supported by every old and new resolution, not a topic or incident-specific checklist. Smaller batches fit the same byte budget; if the complete catalog plus one finding cannot fit, analysis fails clearly with saved progress intact. Each agent call defaults to a five-minute deadline, a 16 MiB prompt bound, an 8 MiB stdout/final-response bound, and a 64 KiB stderr bound. Fully validated batches are checkpointed before the next call. After a provider failure, rerun `analyze` to reuse matching findings and consolidation progress instead of repeating completed work. Changed inputs or consolidation policy invalidate grouping progress without invalidating unchanged finding caches; a complete matching checkpoint needs no model calls. No incomplete rules are published. Complete `analysis.json` is replaced atomically after publication. A successful new capture remains if subsequent analysis fails. Filesystem/disk failures during Markdown publication are not a multi-file transactional guarantee.

Consolidation receives every member's original comment and cause/prevention/resolution/evidence, relevant thread/review context, and complete shared source/patch artifacts for PRs represented by the current batch. Finished PR code is not retransmitted; this is not a new full-code review of every prior finding. Fresh failed repairs require evidence of a relevant attempted change and substantive feedback on that changed state—not merely a new SHA, timestamp, thread or “still broken” message. `originalCommitId` is an original anchor, not a guaranteed current reviewed version; unavailable intermediate code remains unknown. Same-thread separation is permitted only for corroborated differing code windows with ordered comment times, and still requires semantic review of the actual repair. Identical relevant code and ambiguous feedback cannot inflate counts; ambiguous reports also cannot erase supported stages. Squashed commit lists and author dates are not reliable review chronology.

If classification fails the captured-code citation check, analysis allows one complete corrective model response with the same full context and the rejected candidate as untrusted data. The unchanged validator must accept the whole replacement before saving. Other errors and a second invalid response stop normally; correction must fit the same input budget without truncation. Existing valid v6 finding checkpoints remain reusable.

For longer analysis calls, `analyze` and `run` accept `--agent-timeout-ms N` (milliseconds per agent call, including authentication setup). The default remains 300000ms; an explicit positive integer up to 2147483647 may extend or shorten it, never disable it. For example, `--agent-timeout-ms 900000` permits fifteen minutes per call without changing input/output limits, isolation, or evidence requirements.

## Agent isolation (not a security sandbox guarantee)

Adapters invoke real installed executables with argument arrays, prompts on stdin, a fresh temporary working directory outside the project, and ephemeral sessions; temporary data is removed on success/failure. No permission or sandbox bypass flags are used. Authentication is retained without copying project/user instruction files, hooks, or plugins. Shell-exported provider credentials remain available; custom providers requiring user configuration or credential helper programs may require a supported environment credential instead.

- **OMP:** exports/imports credentials through `omp auth` into a temporary home, disables built-in tools, extension/skill/rule/context discovery, LSP/PTY, sessions, and auxiliary-provider services. Configuration/profiles and project dotenv are not carried into analysis.
- **Claude Code:** temporary home/config with only the existing OAuth credential file (or exported API/OAuth environment), safe/restricted mode, empty tool list, disabled skills, strict empty MCP configuration, no setting sources, no Chrome and no session persistence. Managed administrator policy can still apply. `--bare` is deliberately not used because it disables normal OAuth/keychain authentication.
- **Codex:** temporary home/CODEX_HOME with only the existing auth file (or environment credential), no daemon/user config/rules, ephemeral mode, read-only sandbox and approval `never`. Shell, unified execution, Code Mode/host, MCP servers, web search, apps/plugins/hooks, agents, browser/computer/image, memory, skill-search, and other optional execution paths are explicitly disabled with supported options. **Codex has no public global zero-tools switch:** model-specific `apply_patch` can remain registered; the read-only sandbox must deny writes. Do not mistake read-only mode for removal of all tools. This is a narrower supported isolation boundary than OMP/Claude's empty tool lists, not a claim of zero registered Codex tools.

Installed CLI versions must support these flags (interfaces inspected with OMP 18.20.2, Claude Code 2.1.325, Codex 0.167.1). Unsupported options fail rather than silently dropping protections. CLIs/providers, environment-level authentication and administrator policy are trusted dependencies. Isolation is not an OS/container network firewall or proof against compromised CLIs. Review evidence and generated instructions; model validation cannot prove semantic correctness.

## Outputs and review

`rules.md` contains promoted rules and evidence. Managed blocks in `AGENTS.md` and `CLAUDE.md` point to it without replacing human-written text; retained human instructions are not newly learned PR feedback. Candidates and explicit dispositions stay in `analysis.json`. Re-running reuses validated content-based finding and consolidation checkpoints; old groups and duplicate reports do not inflate mistake counts. There are **no runtime guarantees, enforcement hooks, or automatic fixes**.

Finding evidence entries must be exact captured URL or commit SHA strings, never explanations or Markdown; ignored non-actionable findings may use an empty evidence array. Malformed references fail validation rather than being repaired or published.

Technical failures and rejected implementations remain technical findings even inside closure/status comments, with supported causes and dispositions retained. Pure workflow notices or walkthroughs without reported defects remain administrative. Rejection or an unmerged branch does not prove a fix or recurrence.

## Uninstall

```sh
npm uninstall -g comment-to-code
```

Remove only the installed `SKILL.md` files listed above (and their empty `comment-to-code` directories), after checking for your edits. Optionally delete `.comment-to-code/` private data and the scoped `.gitignore` entry. Generated rule blocks use `<!-- comment-to-code:start -->` / `<!-- comment-to-code:end -->`; remove those blocks and `rules.md` only after reviewing/preserving your own content. Other agent configuration is untouched.

## Development

```sh
npm test
# Opt-in actual provider/network check (incurs model usage):
npm run smoke:agent -- --agent omp --model openai-codex/gpt-6.1-sol
# Optional Codex write-isolation probe against a disposable target:
npm run smoke:agent -- --agent codex --probe-isolation
```

Automated subprocess fixture tests validate adapter protocols, not real provider/network behavior.

Consolidation requests native structured output through Claude's `--json-schema` or Codex's `--output-schema`; a missing or failed structured result is an error, not a reason to recover JSON from prose. OMP currently advertises no native schema flag and retains text generation followed by the same strict canonical validation. Native formatting constraints do not prove causal accuracy: review each proposed occurrence, attempted repair and accepted observed resolution.
