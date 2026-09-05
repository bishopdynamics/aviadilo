# TASK BRIEF: <slice name>

> The basis for the prompt given to a worker subagent implementing one slice.
> The worker shares **no context** with the orchestrator: everything it needs must be
> in this brief or in the files it points at. Half the quality of a worker's output
> is the quality of its brief.

## Worker preamble

Copy this verbatim as the first paragraph of every brief. It stops a worker that reads
the project's `AGENTS.md` from starting the session-start protocol.

> You are an explicitly dispatched worker implementing one slice in an isolated checkout. Do **not** run the session-start protocol from `AGENTS.md`: no Elefant, no handoff reading or writing, no task queue, no first run, and no commits unless this brief says so. Follow the rest of `AGENTS.md` and `PROJECT.md`. Touch only the files listed under "Owned files"; if you need anything else, stop and report.

## Goal

One paragraph: what this slice delivers when it's done.

## Context

- Spec: `docs/spec/<spec-file>.md`, section(s) — read before starting.
- Other files to read first: contracts to implement against, existing code to imitate.
- Agent platform / exact model / reasoning effort: ... (Codex via hanuman by default; see AGENTS.md)
- Working directory / branch: ... (for hanuman workers write "see the runtime preamble above"; hanuman fills them in)
- Dispatch options (hanuman workers): sandbox, whether the slice needs network and why, approvals policy. State "no network" explicitly when true.
- Isolation: dedicated worktree for a write task, or `shared checkout (read-only)`.
- Per-checkout setup: commands the worker must run first in a fresh worktree (dependency install, gitignored build artifacts the tests depend on, codegen). "None" is a valid answer — but say so explicitly.

## Owned files

The complete list of files this worker may create or modify. Needing to touch
anything outside this list means the decomposition is wrong — **stop and report**
instead of proceeding.

-

## Contract

The frozen interfaces/types/stubs this slice implements against. Do not change the
contract; if the slice can't work as designed, stop and report.

## Verification

The exact command(s) that prove the slice works. Run them and include their real
output in the final report. Never claim success without this output.

Only worker-runnable checks belong here (unit tests, linters, `make check` — anything
a fresh checkout can run). Verification bound to a singleton environment (GUI/e2e,
device-attached tests, staging) is run by the orchestrator post-merge, not the worker.

```sh

```

## Non-goals

What this slice must NOT do: adjacent work owned by other slices, deferred items.

-

## Report

The final report must include: what was done, the verification output (verbatim),
every decision made where the brief was ambiguous, and anything surprising found
along the way. Workers dispatched through hanuman return this as the structured report
its runtime preamble prescribes (status, summary, verification, files changed, commits,
follow-ups, questions); do not restate that schema here, but do say what the verification
entries must cover.
