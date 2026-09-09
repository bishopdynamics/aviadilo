# Intermittent aircraft warning investigation — 2026-09-09

The user confirms dev.5 aircraft icons work. Earlier reports of absent icons and edit-only behavior were withdrawn. The remaining symptom is an intermittent **Aircraft · unavailable / Source unavailable; shared collection will retry** warning. The supplied screenshot also reports an independent People tracker with no available location.

The household incident's cause is **not yet established**. No runtime change or new release is justified by the current evidence.

## Confirmed behavior

The exact aircraft message comes from `AviadiloService.status_event`, not the icon or type filter. A failure with no retained server snapshot reports unavailable; a matching retained snapshot reports stale. A successful retry clears the warning. Initial/loading states receive 15 seconds of UI grace. Valid empty traffic and filtered-out types do not generate this source error.

| Offline reproduction | Result |
| --- | --- |
| First aircraft request returns HTTP 503 | Unavailable, no last success, retry after 30 seconds with jitter disabled. |
| Same failure with a retained snapshot | Stale, with the previous success time. |
| Last viewer leaves, then returns during cooldown | Snapshot was discarded under the existing no-demand policy; unavailable appears without another provider request. |
| Retry succeeds | Current state, failure count reset, warning cleared. |
| 108 malformed optional-field combinations | Valid records retained; normalized events validate. |
| Synthetic consumer exception after valid publication | Same generic source message, despite scheduler diagnostics showing current / zero failures. |

The final case exposes a diagnostic limitation, not a reproduced natural cause: the collector catches internal exceptions into `product_states`, while diagnostics omit that state and the underlying cause. Current diagnostics can identify cooldown/failure counts but cannot distinguish every HTTP, transport, validation or internal failure. Do not label this incident a provider outage or hide the warning based only on the generic text.

The People message checks whether configured trackers expose valid latitude/longitude. It does not depend on aircraft collection. The screenshot does not identify which tracker is missing.

## Verification

No differences exist between dev.4 and dev.5 in service.py, scheduler.py, providers/base.py or src/map/status.ts. The parent independently ran the three scratch fault-injection tests: **3 passed in 0.95 seconds**, including the 108 field combinations. The read-only native gpt-6-astra/high worker also ran the targeted existing scheduler/provider tests: **17 passed**. Evidence and exact commands are in `/tmp/aviadilo-intermittent-status/{root-repro.log,worker-repro.py,worker-report.md,worker-existing-tests.log}`. Local asyncio sockets required escalation; no browser or HA server was started.

One request per provider over a synthetic ocean location, with no retries or household coordinates, returned HTTP 200 / JSON / no-store at 21:08:44–45 UTC. Both responses normalized successfully. This proves only those requests succeeded; it does not rule out an intermittent fault or a problem specific to the user's HA/network/IP. Evidence: `/tmp/aviadilo-intermittent-status/provider-probes.json`. The adsb.fi v3 radius endpoint remains [documented by the provider](https://github.com/adsbfi/opendata/blob/main/README.md). ADSB.lol's public status history was last updated in April 2025 and is insufficient evidence for today's incident.

## Next evidence needed

Obtain Aviadilo's integration diagnostics while the warning is active, along with the selected provider and whether aircraft remain visible/moving, disappear, or the warning follows reopening the dashboard. The warning's time and any displayed Last success also help. No credentials or household coordinates are needed for this diagnosis.

If existing diagnostics are insufficient, the next justified code change is bounded, sanitized failure categories/timestamps and product state in diagnostics, excluding URLs, response bodies, coordinates, aircraft identifiers and raw exception messages. That is a possible next step, not an implemented fix or a diagnosed cause.
