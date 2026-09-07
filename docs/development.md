# Development

Aviadilo contains the first three slices: bootstrap, HA integration setup/options and collection foundations, plus authenticated transport and a frontend client. The card is still a stub and the fixture harness remains its local development surface. Live providers and the full map/editor follow in the approved serial slices.

## Toolchains

- Node 24.20.0, pinned in `.node-version`; use a Node version manager or the official Node distribution for your OS.
- Python 3.14.2, pinned in `.python-version`, matching the approved Python 3.14 baseline for Home Assistant 2026.9.1.
- `uv` 0.12.8 (also pinned in CI), GNU Make, and Git. The Makefile uses GNU Make 3.81-compatible constructs for macOS; execution was verified on Linux.

Install the pinned Node version before running `make setup`. Dependency versions are recorded in `package-lock.json` and `uv.lock`. Backend tests now use real Home Assistant 2026.9.1 APIs and pytest-asyncio; they require no running HA instance or provider access.

The 2026-09-06 development session provisioned temporary toolchains without changing the host's Node 22/Python 3.12 installation:

```sh
export PATH="/tmp/node-v24.20.0-linux-x64/bin:$PATH"
export UV_PYTHON_INSTALL_DIR=/tmp/aviadilo-python
export UV_CACHE_DIR=/tmp/aviadilo-uv-cache
export npm_config_cache=/tmp/aviadilo-npm-cache
```

Those paths are session conveniences on the Linux development host and may disappear after a reboot. Install the pinned toolchains normally for lasting use. The Node archive was checked against the official SHA256 checksum; Python was installed through `uv`.

## Commands

| Command | Purpose |
| --- | --- |
| `make help` | List tasks; also the default target |
| `make setup` | Prepare the pinned frontend and Python dependencies |
| `make run` | Serve the synthetic fixture preview in the foreground |
| `make check` | Run the local CI gates |
| `make test` | Run frontend and backend automated tests |
| `make lint` | Check source quality |
| `make format` | Apply source formatting |
| `make build` | Build the bundled card and HACS release archive |
| `make clean` | Remove generated build artifacts |

The fixture preview uses synthetic local data and makes no provider requests. Routine tests must remain offline. Live source checks and HA/browser acceptance belong to the orchestrator after their implementation slices.

## Contracts and packaging

`contracts/` holds the versioned JSON schemas and fixtures. Both language implementations validate the same examples. Protocol changes must update both ends together and explicitly handle incompatible versions. Card configuration preserves unknown future fields when editing unrelated settings.

HACS uses the repository as type **Integration**. The archive contains the contents of `custom_components/aviadilo/` at ZIP root, including the built card and brand icon. Frontend, manifest, and tag versions must agree. All runtime dependencies must be available within the installed integration or declared in its manifest.

The GitHub Actions workflows prepare native checks, HACS/hassfest validation, and version-tag release packaging. A locally verified bootstrap archive is not proof of a working HACS installation. Clean HACS installation and upgrade, automatic module loading, and the actual tablet kiosk remain acceptance work in later slices.

Actions are pinned by commit and the HACS/hassfest validator images by digest. The version-tag workflow builds an explicitly labelled draft development prerelease; it does not automatically publish the stub as a usable product.

HACS also requires a public repository description and topics. At the slice 1 kickoff, `bishopdynamics/aviadilo` had neither; GitHub CLI/API credentials were unavailable in this session. The issue tracker was enabled. Before HACS validation, set the description to “A Home Assistant kiosk map combining aircraft, weather radar, wind, and household locations.” and add appropriate topics such as `home-assistant`, `hacs`, `lovelace-custom-card`, `aircraft`, `weather-radar`, and `leaflet`. These requirements are documented by [HACS](https://www.hacs.xyz/docs/publish/start/).

## Slice 1 verification — 2026-09-06

The orchestrator independently ran `make check` on Node 24.20.0/Python 3.14.2: formatting, lint and static types passed in both languages; Vitest passed 31 tests and pytest passed 32. Both frontend builds and release validation passed. Packaging tests cover deterministic output, missing/unsafe paths, version mismatch and imports after extraction.

Headless Chromium 151.0.7922.34 rendered the development and built fixture pages, including a 390-pixel viewport without horizontal overflow. The compiled module extracted directly from the ZIP also registered and rendered under the strict script policy. These checks recorded no JavaScript errors or external resource requests on stable loads. This is bootstrap browser evidence, not acceptance on the user's tablet or Home Assistant instance.

Artifact: `dist/aviadilo.zip`, version `0.1.0-dev.1`, six runtime files. SHA256: `3bd6d1ed3e66f25a384f881f87bcde46cb807c00f4472d4b1f48864f5d7553be`.

## Integration foundation — slice 2

HA's normal setup/options flows cover the shared location, aircraft provider/radius/units, requested interval, disk budget, background collection and conservative provider limits. Cache clearing is a separate confirmed action. Diagnostics expose aggregate state and counts without coordinates, tracker data, response bodies or credentials.

Background collection currently covers the selected aircraft source; radar and wind require viewer demand. This avoids fetching unused weather layers. Viewer leases expire after 60 seconds, and demand is checked again immediately before queued work reaches a producer. Adapters and authenticated transport are later slices, so this slice makes no provider requests.

The scheduler shares one queue per provider (one combined NOAA queue), coalesces requests and retains consumed slots/cooldowns across integration reloads. Correcting settings and reloading can release a permanent error without resetting rate-limit history. Requests have a 60-second timeout.

The cache lives at `<HA config>/aviadilo_cache`, outside the replaceable integration directory. The default disk budget is 512 MiB; complete entry bytes count toward it. Entries are capped at 8 MiB and retained blobs at 32 MiB, reserving room for temporary buffers within the 64 MiB backend cache budget. Metadata/entry count is bounded. Atomic writes, recovery and cancellation handling keep clear/unload operations coherent. Revalidation updates freshness separately from the original data time, and all selected radar products have 24-hour retention.

The module URL includes the integration version. A tiny public bootstrap waits for HA's `home-assistant` element before importing the card; this avoids registering it before HA replaces the browser's custom-element registry. Unload removes the integration's extra-module registration. HA's HTTP router cannot remove an individual route after startup, so the versioned asset routes remain for that HA process and are reused safely on reload.

### Verification — 2026-09-07

Independent `make check` passed 31 frontend and 97 backend tests, formatting/lint, strict mypy on 20 files, both Vite builds and ZIP validation. The five pytest warnings originate in HA/dependency deprecations. In this Codex environment, the sandbox blocks asyncio socket wakeups; the offline check ran with normal escalation rather than changing the tests.

An isolated HA Core 2026.9.1 instance with frontend 20260826.6 and Chromium 151.0.7922.34 exercised graphical setup and options, automatic module loading, confirmed cache clearing and authenticated diagnostics. Changing 75 nmi saved 138,900 metres and reloaded successfully. The test instance is separate from the user's HA installation. Its optional camera/FFmpeg native libraries were absent; no Aviadilo setup failure resulted.

The final ZIP was installed into that isolated instance and HA restarted. The entry loaded with its saved options; both versioned bootstrap and card URLs returned HTTP 200, and the card registered in HA's final registry and rendered. The graphical entry menu exposed Download diagnostics. No Aviadilo provider work was active.

Artifact: `dist/aviadilo.zip`, still development version `0.1.0-dev.1`, now 15 runtime files. SHA256: `61e5f18152807d63f842085b6d618f858336c7ddc8676f15996d6bf82b92e7ed`.

HACS installation/upgrade acceptance remains for slice 8. Docker daemon access was denied at the host level, so the pinned hassfest container was not run. GitHub description/topics and remote HACS validation also remain pending.

## Authenticated transport — slice 3

`websocket.py` implements the four version 1 commands through HA's authenticated connection dispatcher. Each connection owns its own subscription IDs; even another connection for the same user cannot update or heartbeat them. Normal HA unsubscribe/disconnect, lease expiry and integration unload clean up demand and callbacks. The initial status event establishes the frontend's subscription ID.

`src/data/ha.ts` isolates the HA APIs. `createHaAdapter(hass)` supplies `AviadiloClient` with authenticated calls, subscriptions and fetches. The client validates messages, debounces selection updates for 300 ms, tracks revisions, sends 20-second heartbeats, and cancels/revokes tile work on hide, selection changes or disposal. It disables HA's automatic subscription replay so its own reconnect logic uses the latest selection. Server lifecycle signals use the existing status-message field (`aviadilo:closed` and `aviadilo:lease_expired`).

The client is an exported API for the next card/layer slices; the current card stub does not yet consume it. Callers supply a resolved integration entry ID, layer flags, radar source and viewport; call `setSelection`, `setVisible`/`setActive`, `loadTile`/`releaseTile`, and `dispose` as the view lifecycle changes.

Future provider adapters capture a publication context with `service.capture(product, viewport?)` before awaiting work, then call `service.publish(context, payload)` without a viewer envelope. The service rejects stale audiences/areas, fans out current envelopes and bounds shared replay to 16 keys / 8 MiB of serialized snapshots. Aircraft background collection can retain its latest snapshot without viewers.

Radar adapters register a `TileSource` with `service.tiles.register(...)`: explicit trusted HTTPS hosts, products, sizes/styles and a synchronous URL resolver. The gateway owns all fetching, pacing, caching and revalidation. `/api/aviadilo/radar` requires authentication and a current matching viewer/revision, advertised frame and intersecting viewport. Opaque frame IDs travel as encoded query values. There is no arbitrary-URL input and no HA token in the URL.

Initial limits are 4 subscriptions per connection, 16 per user and 128 total; 8 active tile requests per user and 32 total. PNG responses are capped at 2 MiB with bounded dimensions and framing checks. The backend request deadline is 120 seconds and the frontend deadline 150 seconds, allowing queue pacing while ensuring stalled work ends. All upstream redirects are rejected; adapters must use canonical allowed hosts. Upstream failures return errors rather than transparent images. A 304 without new cache headers inherits the stored freshness policy.

### Verification — 2026-09-07

Independent `make check` passed **57 frontend and 169 backend tests**, formatting/lint, TypeScript, strict mypy on 24 files, both builds and the 17-file HACS ZIP check. Tests exercise real HA authentication/HTTP/WebSocket behavior and shared fixtures, with injected upstream responses rather than provider calls.

A temporary bundle of the actual frontend client ran inside the isolated HA 2026.9.1 UI in Chromium 151.0.7922.34. It established a subscription, coalesced two rapid edits into revision 2, removed its viewer on hide, and resumed cleanly. A second authenticated connection could heartbeat its own subscription but received `not_found` when targeting the first connection's ID; closing it left one viewer. Unauthenticated tile access returned HTTP 401. The client recovered from integration reload and a full HA restart using the final ZIP, retaining revision 2 with one viewer. Disposal left zero viewers and zero queued work. The temporary test token was revoked, its private file removed, and HA/browser stopped.

Artifact: `dist/aviadilo.zip`, development version `0.1.0-dev.1`, 17 runtime files. SHA256: `3e334596f5c489bbb8ac7fb65a8de1dd7c7737b4e287844051866312a8b0b136`. Live providers, card wiring and full HACS acceptance remain later slices.
