# First Run

This project was just created from `project-template-a` and has not been initialized.
Work through this process with the user, top to bottom. When everything is done, **delete this file** and commit — the absence of this file is what marks the project as initialized.

## 1. Identity

- [ ] Ask the user for the project's name and a one-line description; fill both into the top of `PROJECT.md`.
- [ ] Write a `README.md` for the project (name, description, how to build/run once known).

## 2. Foundational decisions

Discuss with the user and record the outcomes (they will flow into `ROOT_SPEC.md` later, but capture them now in `docs/handoff/evergreen.md`):

- [ ] **Kind of project** — CLI tool, service, web app, library, firmware, etc.
- [ ] **Language & toolchain** — one of the first decisions the user must make. The template is deliberately language-agnostic.
- [ ] **Repository structure** — define the folder layout appropriate for this kind of project.

## 3. Adjust the template to fit

The process documents are generic; tune them for this kind of project:

- [ ] Extend `.gitignore` with entries for the chosen language/toolchain, **below the managed block** (the template block only covers OS junk, Python, Node, and editors and is overwritten by template migrations).
- [ ] Record process adjustments this kind of project needs under "Project-specific rules" in `PROJECT.md` (call out anything you add to the user). Never edit `AGENTS.md` or `CLAUDE.md`: both are template-owned and replaced verbatim by migrations. Launcher tweaks go in `dev.local.sh`, which `dev.sh` sources when present.
- [ ] Set up build/test scaffolding for the chosen toolchain, if the user wants it now.
- [ ] Create a `Makefile` per the "Makefile conventions" section of `AGENTS.md`, with the reserved verbs that apply to this kind of project. If a Makefile doesn't fit (not a software project), skip it; if uncertain, ask the user.
- [ ] Verify the shared `rm` safety hook is enabled in the coding agent being used. Claude Code loads it from `.claude/settings.json`; in Codex, review and trust the project hook with `/hooks` if prompted.
- [ ] Trust this repository in Codex: the user runs `codex` once in the project root, accepts the trust prompt, then accepts the project hook when `/hooks` offers it. Until then Codex ignores this repository's `.codex/` configuration and hooks, so Codex workers dispatched through hanuman run without the `rm` guard, and hanuman's `status` shows a `configWarning`. Trust of the repository covers the worker worktrees under it.

## 4. Repository

- [ ] The user creates the repository on the GitLab server and adds it as `origin` (agent may help via dev-tools if asked).
- [ ] Verify `git push -u origin main` works.

## 5. Kick off

- [ ] Have the user write (or dictate) `docs/idea/initial-idea.md`.
- [ ] Delete this file, commit, and proceed to `docs/TASK_QUEUE.md` — its first task is Initial Planning.
