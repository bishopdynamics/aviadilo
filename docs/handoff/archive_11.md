# Handoff Main Index

## Current

- **2026-09-07 — Slice 4 implemented and independently verified on authorized session resume.** Responsive Leaflet map, complete graphical settings shell, device_tracker people filtering, central viewport and offline previews are in place. Pause at the slice handoff; next approved slice is **5, Aircraft data and presentation**. ROOT_SPEC remains in progress; user continuation starts the next slice.
- Final independent `make check`: **83 frontend + 169 backend tests**, formatting/lint/TS, strict mypy on 24 files, both builds and 17-file HACS ZIP passed. Root log `/tmp/aviadilo-root-slice4-check.log`. Final artifact hash and detailed evidence are in `docs/development.md`.
- Actual isolated HA 2026.9.1 / Chromium 151.0.7922.34: native graphical title / 25 nmi save/reopen, nearby/Tokyo/unavailable filtering, tracker return preserving manual view, recenter and final-ZIP full restart passed. Final picker preview uses synthetic points with zero OSM requests; HA omits `.preview` there, so the card uses an isolated composed-ancestor helper. Offline fixtures passed 390px sizing, keyboard, synthetic touch events and listener cleanup. Physical touch/device acceptance is unclaimed.
- Medium choices: lone serial native Codex `gpt-6-astra`/high worker because Hanuman is unavailable; fixture-file ownership extension; schema-driven native editor controls; single JS/inline CSS; browser OSM queue one request/second per page with normal caching. No cross-device basemap limit is claimed. Card currently reads integration info but does not subscribe to unfinished layers or continuously refresh integration options; reload after anchor changes.
- Resource audit: worker `slice4_map` completed; only main worktree `/mnt/Fast/projects/aviadilo` on `main`, no stale worktree metadata. HA, both fixture servers and browser sessions stopped. Temporary HA token removed from storage and both private auth files deleted. Existing stopped HA config/venv, toolchains/caches and unserved test artifacts remain under `/tmp` for reproduction; brief `/tmp/aviadilo-briefs/slice4.md`, plan `/tmp/aviadilo-slice4-verification-plan.md`, screenshots `/tmp/aviadilo-slice4-*.png`.
- Preserve app-generated `.bishop/tasks.json`, which remains unstaged outside our commits. All implementation commits remain local; no push, release or production deployment. GitHub description/topics, remote HACS/hassfest and full HACS/kiosk acceptance remain pending as documented.

## Archives

- `archive_10.md` — previous session wrap after slices1–3 and authorization to resume slice 4.
- `archive_9.md` — slice 3 implementation, transport APIs and live protocol verification.
- `archive_8.md` — slice 2 implementation, registry startup fix and real HA verification.
- `archive_7.md` — slice 1 implementation and verification.
- `archive_6.md` — full spec approval and implementation kickoff instructions.
- `archive_5.md` — spec drafting and HACS/GitHub correction before approval.
- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
