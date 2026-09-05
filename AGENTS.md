# Agent Instructions

Shared, template-owned working rules for every project created from `project-template-a`. Template migrations replace this file verbatim, so never edit it inside a project.

> **Project identity and project-specific rules live in `PROJECT.md`.** Read it immediately after this file; where the two conflict, `PROJECT.md` wins.

> **First run:** if `docs/FIRST_RUN.md` exists, this project has not been initialized yet.
> Complete that process before doing anything else.

## Session start (every session)

1. Investigate the available skills, tools, and connectors — particularly `elefant`, `dev-tools`, and `hanuman` when available — so you know what is at your disposal. In Claude Code the `hanuman` tools are deferred: load them with ToolSearch (`+hanuman`) before dispatching a worker.
2. If Elefant (the auxiliary memory system) is available, consult it **before taking any action**. Search using this project's folder name as a keyword/tag; most useful context lives in memories, not the wiki. If Elefant is unavailable, continue from the repository's continuity docs rather than blocking the session.
3. If `Elefant-Offline.md` exists at the repo root, read it as part of the continuity record. When Elefant is available again, add its entries to Elefant, removing each from the cache once successfully added. If the file doesn't exist, Elefant simply hasn't been offline recently.
4. Read `docs/handoff/evergreen.md` (always-relevant handoff info), then `docs/handoff/index.md` (the previous session's handoff).
5. Read `docs/TASK_QUEUE.md` and process it per the "Task queue" section below.

## Template ownership

Files copied from the template fall into two groups.

- **Template-owned** — replaced verbatim by the template's migration tool; never edit them in a project: `AGENTS.md`, `CLAUDE.md`, `dev.sh`, `.agent-hooks/`, `docs/spec/SPEC_TEMPLATE.md`, `docs/spec/TASK_BRIEF_TEMPLATE.md`, `docs/FIRST_RUN.md` (while it exists), the managed block at the top of `.gitignore`, and the safety hook registration plus `deny` entries in `.claude/settings.json` and `.codex/hooks.json`.
- **Project-owned** — everything else; migrations never touch it. Project-specific process rules go in `PROJECT.md`, launcher tweaks in `dev.local.sh` (sourced by `dev.sh` when present), extra ignore rules below the managed block in `.gitignore`, extra permissions anywhere in the settings files outside the template-owned entries.

## Document system

- `PROJECT.md` — **project-owned**: name, description, and project-specific rules that extend or override this file.
- `docs/idea/initial-idea.md` — user-authored: the raw project idea. Input to the first planning task, which produces `docs/spec/ROOT_SPEC.md`.
- `docs/TODO.md` — **user-managed** intake list for the user's ideas. The only change the agent makes there is marking items done.
- `docs/DEFERRED.md` — **agent-maintained** list of things deliberately deferred, mirrored from each spec's Deferred / Follow-ups section. Never write deferred items into `docs/TODO.md`; the user promotes items from here when the time is right.
- `docs/spec/` — feature specs. `ROOT_SPEC.md` covers the first sprint; every later feature gets `FEATURE_SPEC_<thing>.md` and is referenced as an addendum at the top of `ROOT_SPEC.md`. Use `docs/spec/SPEC_TEMPLATE.md` as the skeleton.
- `docs/TASK_QUEUE.md` — **agent-worked** ordered queue that drives session-by-session work; entries mostly point at spec files.
- `docs/handoff/` — cross-session continuity, auxiliary to Elefant (whose read path may be unreliable). `index.md` holds the live current block; older entries move to `archive_<number>.md`; durable always-read info lives in `evergreen.md`.

Lifecycle: idea → research & discuss → spec → task queue → implement in slices → done (the user's assessment, not yours).

## Task queue

`docs/TASK_QUEUE.md` is processed like this:

1. Pick the next task from the top of its "Queue" section. Most tasks name a feature spec file, `docs/spec/<name>.md`.
2. Explain the task to the user; ask for confirmation or clarification.
3. Implement it per "Implementation approach" below, following the autonomy levels:
   1. Mark the task `[in-progress]` in the queue when you start.
   2. Stop and ask when a decision genuinely needs the user (big things, spec-impacting changes).
   3. Commit for each slice, update the task's status in the queue, report what was done, and wait for the user before continuing.
4. Sessions often end partway through implementation — that's expected. Update the task's state in the queue before handing off.
5. Only when a task is complete (the **user's** assessment) is it removed from the queue.
6. One task is in-progress at a time by default; order matters. Parallelism happens *inside* a task (a spec's parallel slice groups). Exception: a later task may run concurrently under the cross-task parallelism rules in "Implementation approach"; it still gets its own explain-and-confirm step, and both tasks are marked `[in-progress]`.

## Autonomy levels

The goal is to answer the important decisions **in the spec**, so implementation proceeds with minimal input.

- **Small things:** handle automatically, with the spec as the guide.
- **Medium things:** handle automatically when "the right way" is obvious — but report every such choice at the end.
- **Big things:** stop and get the user's input. Especially anything that impacts the spec (e.g. "cannot implement it the way we thought; need to go back to alternative approaches and re-spec").
- **Context limit:** when context usage grows beyond ~60%, stop at the next clean point — update handoff and memories, then hand off.

## Implementation approach (orchestrator + workers)

When implementing a spec, the session acts as an **orchestrator**: it farms slices out through the coding agent's subagent/delegation tools, then verifies and reviews the workers' work. The orchestrator writes briefs, dispatches, integrates, verifies, and reviews — it implements only trivial glue itself. This also keeps its context lean.

- **Scheduling comes from the spec.** Each slice in the Implementation Plan is marked `[serial]` or `[parallel-N]`; slices sharing a parallel group number are eligible for concurrent dispatch. A parallel group describes dependency shape, not permission for multiple workers to write the same checkout. If the required isolation cannot be provided, serialize that group.
- **Cross-task parallelism (exception).** Parallelism normally happens inside a task, but the orchestrator may dispatch a *later queue task* concurrently with the in-progress one when **all** of: (a) the two specs' owned-files lists are provably disjoint; (b) the later spec is approved and does not depend on outcomes of any in-progress task (decisions, behavior, or formats still being settled — this is a judgment call, not just a file check); (c) the later task still goes through the queue's normal explain-and-confirm step before dispatch. Shared continuity docs (dev guide, handoff, `DEFERRED.md`) never count as disjoint — the orchestrator serializes those edits itself.
- **Contracts first.** Shared interfaces/types/stubs land in a serial slice *before* any parallel group; parallel workers implement against that frozen contract and own disjoint files. A change to a protocol with two ends in different languages/components (e.g. a wire format with a serializer in one language and a parser in another) is itself a single contract: both ends belong to **one** worker — never split the ends of one protocol across parallel workers, or they drift against a prose description and are only testable together.
- **Every worker gets a brief** built from `docs/spec/TASK_BRIEF_TEMPLATE.md`. Workers share no context with the orchestrator — the brief must be self-contained.
- **Non-code duties are orchestrator-only.** Handoff docs, memory-system writes (Elefant), `DEFERRED.md` mirroring, and task-queue bookkeeping never appear in a worker's brief — workers lack the context to write accurate continuity, and concurrent appends corrupt exactly the files that must stay coherent.
- **Worker platform, models, and reasoning.** Implementation slices go to **Codex workers by default**, dispatched through the `hanuman` tools (below); Claude workers through the Agent tool are the fallback. Pin each worker's exact model and reasoning effort at dispatch so cost and capability are deliberate rather than accidental inheritance. These are role mappings, not claims that the vendors' models are behaviorally equivalent:
  - Codex (default): `gpt-6-astra` with `high` reasoning for demanding implementation, `gpt-5.6-sol` with `medium` reasoning for lighter or read-heavy work, and `gpt-5.6-luna` with `low` reasoning only for narrow, repetitive, high-volume tasks.
  - Claude (fallback): Opus for demanding implementation and Sonnet for mechanical slices such as boilerplate, scaffolding, or rote refactors.
  - Fall back to Claude only when Codex is out of usage — hanuman's `status` reports usage and time to reset, so check it rather than guess — or when the `hanuman` tools are absent from the session. Report every fallback, and every downgrade from the demanding-work tier, as a medium choice.
  - Read-only exploration for the orchestrator (Explore agents) stays on Claude's Agent tool regardless of the default.
  - Codex-orchestrated sessions: Codex subagents inherit the parent model and reasoning effort when those values are omitted. Pass both at dispatch when possible; otherwise use a configured custom agent/default and record any intentional inheritance in the worker brief.
- **Dispatching Codex workers (hanuman).** `hanuman` is an MCP server registered at user scope; its repository's README covers installation, and its `docs/usage.md` the per-tool detail. `dispatch(name=<slice>, brief_file=<brief>, repo=<absolute repo path>, model=…, effort=…)` starts a worker in the worktree `.agent-worktrees/<slice>` on branch `codex/<slice>` and returns a `run_id` immediately, so several workers run concurrently. Always pass `repo` explicitly. Follow a run with `wait(run_id)` — Claude Code backgrounds it after two minutes and wakes the orchestrator with the result — or by pointing Monitor at the run's event feed. A worker that needs network access, a write outside its worktree, or an answer pauses; `wait` and `status` show `needs_attention`, and the orchestrator answers with `approve` (`accept`, `accept_for_session`, `decline`, `abort`, or `answers` for a question). `send` steers a running worker or gives an idle one a follow-up turn, which is the way to fix a review finding without re-dispatching; `stop` interrupts. The worker's final message is a structured report (status, summary, verification with real output, files changed, commits, follow-ups, questions), kept with the brief, transcript, diff, and protocol log under `.agent-worktrees/_runs/<run_id>/`. After verifying and merging, `finish(run_id)` removes the worktree and branch; it refuses, never forces, when the tree is dirty, the branch is unmerged, or the worker is busy. Dispatch options: `sandbox` (default `workspace-write`), `network` (default off; set it when the brief says the slice needs it, e.g. a dependency install), `approvals` (default `claude`; `auto_review` for a worker you do not want to babysit, `deny` only when the brief needs nothing outside the sandbox), `isolation: none` for a lone serial worker in the main tree. Safety: the project's `.codex/hooks.json` (the `rm` guard) applies to Codex workers, worktrees included, only once Codex has trusted the repository and that hook (the first-run step); until then hanuman's `status` shows a `configWarning` and the `workspace-write` sandbox, which confines a worker's writes to its disposable worktree, is the only net. Keep Claude's own Agent tool for Claude-model workers and read-only exploration. The reverse direction (Codex dispatching Claude) is not supported.
- **Isolation:** file ownership is not filesystem isolation. Parallel write workers use separate git worktrees and branches; the orchestrator integrates them in dependency order. Use built-in worktree isolation when available. Codex subagents may share the parent's filesystem by default, so the orchestrator must create each write worker's worktree, put its exact absolute working directory and branch in the brief, and ensure the worker operates there. If the dispatch interface cannot guarantee that working directory, keep workers read-only or run them serially. A lone serial worker may work in the main tree. Worktree isolation has a real per-worker cost in compiled/toolchain-heavy projects (cold build, per-checkout artifacts) — weigh that tax against the parallelism win when deciding serial vs parallel; small groups often lose. A shared build cache (e.g. `CARGO_TARGET_DIR`) is a mitigation with a cost: build-dir locking largely serializes concurrent builds, trading cold-build time against parallelism. Worktrees created by hanuman live under `.agent-worktrees/` (ignored via the managed `.gitignore` block); once integrated, remove them with hanuman's `finish`, which deletes the branch too.
- **Worktree lifecycle:** worktrees are temporary resources, not permanent project state. After a worker's changes are integrated or deliberately abandoned, stop the associated worker/session, verify the worktree is clean and its commits are merged or otherwise preserved, then remove the worktree without force and prune stale worktree metadata. Prefer the coding platform's safe session/worktree cleanup command when it manages both; otherwise use Git directly. For hanuman workers that command is `finish`; hanuman also removes an unchanged worktree on its own when the dispatch turn ends. Never remove a dirty, unmerged, locked, active, or uncertain worktree just to tidy the list. At session end, audit `git worktree list` and hanuman's `status(include_past=true)`; clean up completed worktrees and record the path, branch, owner, and reason for every intentional survivor in handoff.
- **Verify, then review.** A worker's claim of success is not evidence. Workers must include real verification output in their report; the orchestrator re-runs verification itself after each merge, then reviews the diff. Briefs carry only the worker-runnable subset of verification (unit tests, linters, `make check`); anything bound to a singleton environment (GUI/end-to-end, device-attached tests, staging deploys, session-scoped debug adapters) cannot fan out to N worktrees and is run by the orchestrator post-merge.
- **Off-course workers:** course-correct through the platform's worker-messaging controls (`send` for hanuman workers). If a worker breaks its brief (touched unowned files, can't pass verification), discard its isolated branch and re-dispatch with a better brief — don't hand-patch structural failures.

## Makefile conventions

Almost every software project gets a `Makefile` with a common vocabulary of dev-task verbs, so `make <verb>` means the same thing in every repo. It is a **thin vocabulary layer that delegates to the project's native tooling** (cargo, uv, npm, docker compose, …), not a build system in itself. If a Makefile doesn't make sense for this project (e.g. it's not a software project), don't force one; if uncertain, ask the user.

- **Reserved verbs, fixed meanings.** Omit any that don't apply — never repurpose one. Project-specific tasks get their own distinctly named targets that don't collide with the reserved list.
  - `help` — list targets with one-line descriptions; the **default target**, self-documented from `##` comments.
  - `setup` — one-time dev-environment bootstrap: toolchains, dependencies, git hooks.
  - `run` — run the app locally, foreground, dev mode.
  - `build` — produce build artifacts.
  - `test` — run the automated test suite.
  - `check` — everything CI would gate on: lint + format check + typecheck + tests.
  - `clean` — delete generated artifacts only; never source, config, or data.
  - `install` — install this package onto this system.
  - `deploy` — build and start the project's Docker container(s), commonly `docker compose up --build -d`.
- **Reserved companions** (optional, but same meaning everywhere if present): `lint`, `format`, `stop` (tear down what `deploy` started), `logs` (follow deployed containers' logs), `status`, `uninstall`, `update` (refresh dependencies), `release`, `docs`. Wherever `deploy` exists, provide `stop` and `logs`.
- Keep `setup` (prepare the repo for development) distinct from `install` (put the product onto the system), and `run` (local, foreground) distinct from `deploy` (containerized, detached).
- Mark all task targets `.PHONY`. macOS ships GNU make 3.81 — avoid newer GNU make features and keep recipes POSIX-sh, portable across macOS and Linux.

## Session end

- Audit worker worktrees (`git worktree list` and hanuman `status(include_past=true)`) before handoff: remove safely completed worktrees, prune stale metadata, and document every intentional survivor with its branch, owner, and unresolved state.
- Update `docs/handoff/index.md` with the session's handoff. Keep it minimal: split older entries into `docs/handoff/archive_<number>.md` and promote durable reference info into `docs/handoff/evergreen.md`.
- When Elefant is available, create memories as you go so no progress information is lost between sessions. If it is unavailable, append them to `Elefant-Offline.md` at the repo root instead.

## Environment rules

- `rm` may never be run with `-f`/`--force`; any command containing it is denied in full. This is policy, not a transient error — simply rerun the same command without the `f` flag (`rm` and `rm -r` work fine). A hook will remind you if you forget.
- The team develops on both macOS and Linux (Debian-family, mostly Linux Mint). Keep scripts and tooling portable across both.
