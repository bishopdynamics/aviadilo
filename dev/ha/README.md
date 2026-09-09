# Isolated Home Assistant acceptance

Use the locked HA 2026.9.1 / Python 3.14 environment. The instance lives outside the repository, binds localhost:18123, and contains synthetic coordinates. It never reads an existing HA configuration or creates credentials. Complete normal HA onboarding and integration setup in the UI.

```sh
make build
uv run --frozen python dev/ha/manage.py prepare --fixtures
uv run --frozen python dev/ha/manage.py run
```

HA may install component requirements on its first start. For the same isolated GUI environment used in acceptance, prepare a dedicated environment with the matching frontend first:

```sh
uv venv --python 3.14.2 /tmp/aviadilo-ha-venv
uv pip install --python /tmp/aviadilo-ha-venv/bin/python homeassistant==2026.9.1 home-assistant-frontend==20260826.6
/tmp/aviadilo-ha-venv/bin/python dev/ha/manage.py prepare --fixtures
/tmp/aviadilo-ha-venv/bin/python dev/ha/manage.py run
```

The generated instance includes Recorder with one-day retention because the current HA frontend queries it during dashboard startup. Energy is also loaded so HA's built-in card-picker previews have their normal WebSocket commands before you filter to Aviadilo. All recorded tracker data in this instance is synthetic. HACS itself is not installed by this helper.

HA 2026.9 stages HTTP host/port changes until you confirm them. Complete onboarding promptly, then confirm the pending HTTP configuration through Home Assistant's native HTTP settings UI (or its authenticated confirmation API) within five minutes. If left unconfirmed, HA rolls back the change and requests a restart; this can restore the previous port/bind settings. The launcher preserves this safeguard and prints a reminder; it never confirms or disables it automatically.

The managed launcher restarts HA on its normal exit code `100`, retaining the instance lock throughout shutdown and restart. Every child starts with its working directory set to the resolved managed config directory. This keeps HA's `custom_components` namespace bound to the installed package even when the launcher is invoked from the source checkout. Other exit codes are returned to the caller. Ctrl-C requests graceful HA shutdown and waits for it; a second Ctrl-C requests termination. Stop the managed launcher before preparing an upgrade.

`--config /tmp/another-aviadilo-instance`, `--port 18124`, and `--archive /path/to/aviadilo.zip` are optional preparation arguments. Existing directories require the development marker; managed runs lock out package replacement. Stop HA before preparing another package. Preparation validates bounded ZIP paths, CRC and manifest/bundle version agreement, then replaces only the installed integration. The preceding integration is retained at `custom_components/.aviadilo-previous`; HA settings, auth, dashboard and public cache remain intact. The current candidate additionally passes `scripts/check_release.py` against repository metadata during `make build`.

`--fixtures` installs a development-only `aviadilo_fixture` integration and adds a required dependency to the *installed* Aviadilo manifest. This installed-only dependency ensures the shim is active before provider clients are created on every restart, and fails closed if the fixture cannot start. The distributed ZIP and repository manifest are untouched. The shim replaces the integration's upstream weather/OSM HTTP session and external-photo HTTP session: real HA auth, WebSocket subscriptions, revision checks, asset/tile gateways, scheduling, caches, image normalization and compiled card remain in use. Unknown upstream hosts fail closed. No shim is shipped in HACS. Block and record all direct external browser requests before opening any card; the production card uses first-party HA routes for its data.

Before browser acceptance, authenticate normally and call `aviadilo_fixture/stats` over HA WebSocket. Require `integration_module_path` and `fixture_module_path` to point under the managed config's `custom_components`, and both `service_session_is_fixture` and `osm_session_is_fixture` to be true. Refuse viewer traffic if this check fails. `upstream_requests` counts fake upstream requests by host and resets on process restart; it can prove warm cache hits without changing production scheduling. OSM fixture freshness is seven days; weather remains five minutes.

The fixture supplies `device_tracker.synthetic_0` (external HTTPS photo), `device_tracker.synthetic_1` (first-party `/local` avatar), and `device_tracker.synthetic_unsupported` (unsupported HTTP/LAN photo, expected initials). Select them explicitly and enable their photos in a test card. Preparation creates `www` before HA registers `/local`; fixture setup writes the avatar before integration readiness. Raw picker, editor and saved cards use this same injected HA state and normal transport, with no production synthetic mode.

For unmodified installed-package acceptance, omit `--fixtures` and use an aircraft/radar/wind-disabled people-only card until bounded provider access is deliberately enabled. Normal upgrades preserve `ui-lovelace.yaml`. Changing fixture mode saves it to `ui-lovelace.before-mode-change.yaml` and writes a fresh dashboard; the non-fixture dashboard disables all external layers. Preparation regenerates `configuration.yaml` and removes the fixture component when disabled. A normal HA integration setup/restart is still required; this helper does not claim a HACS download/upgrade or physical kiosk test.

Upgrade exercise: stop the managed instance, prepare the baseline ZIP with the same config and fixture mode, onboard/configure once, stop, prepare the new candidate ZIP, and restart. Confirm saved entry/options/dashboard/cache survive and `/aviadilo_static/<new-version>/bootstrap.js` imports the matching new bundle. HACS custom-repository download requires an accessible GitHub release and is a separate acceptance step.

Role coverage: create an owner first, then explicitly ordinary and read-only test accounts, and assert neither is_owner nor is_admin. HA automatically makes its first user an owner, so a named "test user" alone does not exercise kiosk permissions. Make the synthetic acceptance dashboard visible to these users; keep their roles unchanged. Asset acceptance must cover the dedicated aviadilo/subscribe_assets command, visible tiles, generation invalidation and reconnect under both non-admin roles, while raw arbitrary-event subscriptions and unauthenticated HTTP remain refused.
