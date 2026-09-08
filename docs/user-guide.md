# Using Aviadilo

Aviadilo combines aircraft, radar, wind, and household trackers in one Home Assistant map. It targets Home Assistant 2026.9.1 and Chromium. Version `0.1.0-dev.2` is a development prerelease under acceptance.

## Installation

1. In HACS, add `https://github.com/bishopdynamics/aviadilo` as a custom repository with type **Integration**. Open Download/Redownload, expand **Need a different version?**, and explicitly select `v0.1.0-dev.2` in the Release dropdown. Confirm the dialog names that version before downloading. Restart Home Assistant when requested.
2. Open **Settings → Devices & services → Add integration → Aviadilo**. Choose the shared collection anchor, aircraft provider, radius, and cache settings. Leave conservative provider pacing at its defaults unless you want slower collection.
3. Reload the dashboard in your browser. Edit the dashboard, add a card, and select **Aviadilo**. The integration loads its matching card automatically; no manual JavaScript resource is needed.
4. Use the graphical editor to choose layers and add your `device_tracker` entities under People. Save the card.

The card picker and editor show synthetic locations and weather. Preview data does not represent your household or current conditions.

## Map and layer controls

The layer buttons change visibility for the current card session. Save defaults through the card editor. Aircraft and people remain current while you view older radar frames; there is no synchronized historical people or aircraft replay.

- **Aircraft:** tap a marker or list callsign for details. The list can collapse; choose map, list, or combined layout in the editor. Altitude, distance, age and airborne filters apply before drawing and automatic fitting. Unknown values remain distinct from zero.
- **Radar:** RainViewer is the default; NOAA MRMS and KSOX are alternatives. Use Latest, Loop, or the history slider. The timestamp and legend describe the displayed radar frame. Clear areas can also mean missing coverage.
- **Wind:** enable static arrows or barbs, particles, or both. Arrows and particles follow the wind; barbs show the direction it comes from. Static markers remain useful when reduced motion disables animation. Wind is a forecast field, with its own valid time, separate from radar playback.
- **People:** select existing `device_tracker` entities. The default 50 km radius filter excludes distant travellers before fitting the map. A missing configured anchor hides radius-filtered people until the anchor is available.

Dragging or zooming suspends automatic fitting. Recenter returns to the configured view; an optional idle timeout can return automatically. Weather never independently recenters the map. Hidden cards stop requesting external layers and stop animation.

## Shared collection and local display

**Settings → Devices & services → Aviadilo → Configure** changes the shared collection area, aircraft source, requested refresh interval, cache budget and provider pacing. These settings affect every card. Aircraft background collection is optional; radar and wind require a visible viewer.

The card editor controls that card's view, filters, units, layers and presentation. Expanding the view does not enlarge the integration's aircraft collection area. Display changes reuse available data. Multiple viewers share provider queues and cached responses; source limits can make effective refresh slower than the requested interval.

## Updates and troubleshooting

If a download URL contains a commit hash such as `17c240a`, HACS has not selected a published release. This can happen even after updating repository information: Aviadilo currently has only a prerelease, so HACS's default available version can fall back to the latest commit. Explicitly select `v0.1.0-dev.2` under **Need a different version?**; the user confirmed this resolves the download. HACS 2.0.5's current download dialog lists prereleases in that dropdown and does not require a separate Show beta versions checkbox. A failed GitHub validation workflow does not control this version selection.

Aviadilo requires the compiled `aviadilo.zip` asset attached to a versioned [GitHub Release](https://github.com/bishopdynamics/aviadilo/releases). A source push, tag alone, or unpublished draft does not provide that asset. [HACS version rules](https://www.hacs.xyz/docs/publish/start/#versions), [refresh/download controls](https://www.hacs.xyz/docs/use/repositories/dashboard/).

Update the single integration package through HACS, restart HA when requested, then reload browser dashboards. Backend and card versions travel together. Settings and the bounded public-data cache live outside the replaced integration directory.

If Aviadilo is missing from the card picker, confirm that its integration loaded and reload the dashboard. If external layers are unavailable, check the card's source status and the integration's configured anchor; people can still use HA state. A disabled wind display makes no wind requests. Wind or radar data can be unavailable even when aircraft work because sources are independent.

Use the integration's diagnostics download for aggregate scheduler/cache status. Cache clearing is a separate confirmed action in Configure; it affects every viewer and causes later requests to refill the cache. Avoid clearing it repeatedly when investigating a provider outage.

For development or offline acceptance, follow [the isolated HA guide](../dev/ha/README.md). Its clearly synthetic instance is separate from an existing household installation.
