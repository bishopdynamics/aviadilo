# Handoff Main Index

## Current

- **2026-09-06 — ROOT_SPEC.md approved in full.** User requested session wrap and implementation beginning next session. Marked spec approved, cleared open questions, accepted engineering defaults/deferrals, completed Initial Planning, and queued implementation as ready. Do not reopen approvals or begin production work in this wrap session.
- **Next session:** read `PROJECT.md` and the approved `docs/spec/ROOT_SPEC.md`, verify remaining first-run trust/setup, then start slice 1 (Bootstrap, HACS packaging and frozen schemas). Toolchains: Node 24 LTS and Python 3.14.2+ within 3.14 for the HA 2026.9.1 baseline. The earlier host probe found Node 22 and Python 3.12, so setup must supply the approved versions. Keep `docs/FIRST_RUN.md` until remaining local setup is complete; avoid restarting the identity/stack/repository discussion.
- Accepted choices: one shared integration area; adsb.fi default/ADSB.lol alternative aircraft feeds; 50 km aircraft radius/10-second requested interval; 512 MiB disk and 64 MiB memory cache; authenticated shared transport; complete visual editor and people-radius filtering. Radar: RainViewer default, NOAA MRMS, NOAA KSOX. Wind: DWD ICON global. Kiosk: tablet PC with Chromium, current HA (baseline 2026.9.1).
- HACS from the first release: bundled Integration package and card, automatic module registration, GitHub Actions/HACS/hassfest, install/upgrade acceptance. Public repository `github.com/bishopdynamics/aviadilo`; remote `github`, upstream `github/main`. The user committed/pushed all prior research/spike work as `0a91da2`; this wrap records the HACS correction and final approval.
- Static research artifact remains `docs/spikes/claremont-weather/comparison.html` (offline, seven genuine source images). Source cache/provenance and verification are adjacent. It makes no provider requests while viewed. No production code was added this session.
- Resource audit: only the main worktree `/mnt/Fast/projects/aviadilo` on `main`; no stale worktree metadata, worker worktrees, active workers, or spike/preview processes. Native worker `spike_page` completed earlier; hanuman tools are absent. Temporary render dependencies at `/tmp/aviadilo-spike-venv` can remain for reproducing the spike; they are not the production toolchain.

## Archives

- `archive_5.md` — spec drafting and HACS/GitHub correction before approval.
- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
