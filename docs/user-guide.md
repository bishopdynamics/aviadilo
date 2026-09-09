# Using Aviadilo

Aviadilo combines aircraft, radar, wind, and household trackers in one Home Assistant map. It targets Home Assistant 2026.9.1 and Chromium. This guide describes the `0.2.0-dev.3` kiosk candidate. The normal HACS release remains `0.1.0`; household tablet acceptance is still in progress.

Version `0.1.0` includes shared basemap caching and the same real data in saved, editor and picker views. Production previews do not substitute synthetic locations or weather. Synthetic data is confined to the developer test harness. The older `v0.1.0-dev.2` prerelease used synthetic editing previews and remains available for explicit version selection.

## Installation

1. In HACS, add `https://github.com/bishopdynamics/aviadilo` as a custom repository with type **Integration**. Download the latest normal release (`v0.1.0`). If already installed, use the ordinary Update action. Restart Home Assistant when requested.
2. Open **Settings → Devices & services → Add integration → Aviadilo**. Choose the shared collection anchor, aircraft provider, radius, and cache settings. Leave conservative provider pacing at its defaults unless you want slower collection.
3. Reload the dashboard in your browser. Edit the dashboard, add a card, and select **Aviadilo**. The integration loads its matching card automatically; no manual JavaScript resource is needed.
4. Use the graphical editor to choose layers and add your `device_tracker` entities under People. **Save the card, then click Done to leave dashboard edit mode.**

The card picker, card editor and dashboard edit mode use the same HA states, source fetching and shared caches as the saved card. **Done** exits dashboard editing. Missing HA context, integration or source data produces a real loading/unavailable state. HA may recreate its preview card after a settings change, which creates a new viewer while shared data/cache remains available.

## Kiosk candidate upgrade

To try `v0.2.0-dev.3`, explicitly select it in HACS under **Need a different version? → Release**. Restart HA and reload dashboard browsers before editing card settings. Existing dashboards load through an in-memory migration; a normal editor save stores version-2 card configuration, which an old cached frontend cannot read. Integration settings and the shared cache are retained.

Legacy combined wind markers and particles become **Particles**. Legacy wind settings that drew nothing become **Arrows**, while preserving whether the Wind layer is enabled.

## Checking the saved card

Saved and editor cards should load real basemap tiles, selected HA trackers and enabled provider layers. The published integration does not contain the development provider shim. A **Synthetic · offline preview** badge or fabricated DEMO/Alex/Sam data indicates the older prerelease/frontend is still loaded; confirm the update, restart HA and reload the browser.

Defaults: aircraft and people layers are enabled; radar and wind are disabled. People has no trackers selected initially. Enabling Wind displays arrows by default; choose Arrows, Barbs or Particles in the editor. Leave provider pacing unchanged while testing, and allow initial loading to finish.

| Check | Action and expected result |
| --- | --- |
| Connection and basemap | Look for real roads/place labels around your configured HA home/anchor in either viewing or editing. A healthy card has no routine status panel; a problem indicator provides failure details. Cached revisits should load promptly; genuinely new tiles remain paced by the integration. |
| Aircraft | Select a callsign in the list and its marker; both should select the same aircraft and show details, including configured position-age fields. Confirm distances make sense for your collection area. Empty results can be legitimate; defaults exclude aircraft on the ground. |
| People | Add known device_tracker entities and compare displayed positions with HA. Start with one nearby tracker. The default 50 km filter intentionally excludes distant people before fitting the map. |
| Radar | Enable Radar and keep RainViewer for the first check. Choose Latest or Loop in the editor. Its Live inspection shows the displayed frame time, matching legend and coverage. Historical radar must not rewind people or aircraft. No precipitation over your area can be legitimate; loading/unavailable is a separate state. |
| Wind | Enable Wind and choose arrows first, then optionally particles. Choose a visible wind color. Live inspection shows DWD ICON-global information and model-valid time. Reduced motion displays static arrows while preserving a saved Particles setting. |
| View and persistence | Pan/zoom manually and ensure ordinary updates preserve the view; Recenter should restore the configured view. Save a title/unit/filter change, click Done, reload and verify it persists. Test list collapse and narrow/touch layout without overlapping cards or losing map controls. |
| Recovery | Navigate away and back or reload the dashboard. Enabled layers should resume without duplicate markers or persistent loading. Repeated cache clearing is unnecessary. |

Missing aircraft metadata, a wind model run marked unknown, and unavailable coverage detail are explicit missing-information states. They are not unimplemented placeholders. Flight route/photo enrichment and synchronized historical people/aircraft replay are outside this release.

The combined-card automated and isolated HA endurance checks used synthetic provider responses; bounded real provider checks were separate. Normal dashboard behavior with the user's actual sources, trackers and tablet remains acceptance work. If a check fails, record whether you were editing or viewing, which layer/source was affected, its exact status text and the action that triggered it.

## Map and layer controls

The layer buttons change visibility for the current card session. Save defaults through the card editor. Under Map, turn off **Show layer buttons** to use fixed saved layer selections. **Show recenter button** is independent; turn both off for a clean map. Use the map layout if you also want to omit the aircraft list. Aircraft and people remain current while you view older radar frames; there is no synchronized historical people or aircraft replay.

- **Aircraft:** tap a marker or list callsign for details. The list can collapse; choose map, list, or combined layout in the editor. Altitude, distance, age and airborne filters apply before drawing and automatic fitting. Unknown values remain distinct from zero.
- **Radar:** RainViewer is the default; NOAA MRMS and KSOX are alternatives. Choose Latest or automatic Loop, history length, frame duration and opacity in the editor. Live inspection provides the displayed timestamp, legend and coverage. Aircraft and people stay current during radar playback.
- **Wind:** choose exactly one of Arrows, Barbs or Particles in the editor, plus color and opacity. Marker size/spacing or particle count/speed/trail controls appear for the selected mode; switching retains their saved values. Arrows and particles follow the wind; barbs show where it comes from. Reduced motion uses arrows without changing the saved mode. Wind has its own forecast-valid time.
- **People:** select existing `device_tracker` entities. The default 50 km radius filter excludes distant travellers before fitting the map. A missing configured anchor hides radius-filtered people until the anchor is available.

Enable **Auto-size height to page** under Map to fill the remaining visible page below the card. It adapts to resizing and respects fixed scroll-container limits, including editor previews. Fixed pixel height remains the default and is retained when auto sizing is off. The minimum map height is 160px; tall titles/controls/aircraft details can still require scrolling. Scrolling alone does not grow the card.

Choose **Follow Home Assistant**, **light** or **dark** under Map theme. Theme and wind-color changes reuse existing tiles and data.

A healthy card keeps its controls, optional aircraft list and source credits visible without routine weather/status panels. After the initial loading grace, **Map data needs attention** opens read-only causes, timestamps and recovery guidance. Close it with Escape, the close button or a tap outside. Use **Live inspection** in the editor for healthy weather details.

Dragging or zooming suspends automatic fitting. Recenter returns to the configured view; an optional idle timeout can return automatically. Weather never independently recenters the map. Hidden cards stop requesting external layers and stop animation.

## Shared collection and local display

**Settings → Devices & services → Aviadilo → Configure** changes the shared collection area, aircraft source, requested refresh interval, cache budget and provider pacing. These settings affect every card. Aircraft background collection is optional; radar and wind require a visible viewer.

The card editor controls that card's view, filters, units, layers and presentation. Expanding the view does not enlarge the integration's aircraft collection area. Display changes reuse available data. Multiple viewers share provider queues and cached responses; source limits can make effective refresh slower than the requested interval.

## Updates and troubleshooting

A blank basemap with **Refusing to allow … to subscribe to event aviadilo/assets_changed** is a permissions bug in releases through v0.2.0-dev.2. Update to v0.2.0-dev.3, restart HA and reload the kiosk page. Keep the kiosk's existing regular/read-only role: MQTT and administrator permissions are not involved. Browser cache/profile clearing alone cannot correct this server-side refusal. The fixed version uses a dedicated authenticated metadata subscription while preserving HA's event and entity access restrictions.

If HACS still offers a commit hash, its metadata may reflect the former prerelease-only repository. On Aviadilo's entry, open the three-dot menu and choose **Update information**, then install the `v0.1.0` update. This refresh changes version metadata; it does not install files by itself. After downloading, restart HA and reload the dashboard. See [HACS metadata refresh](https://www.hacs.xyz/docs/use/repositories/dashboard/#updating-repository-metadata).

Normal releases use tags such as `v0.1.0`; development versions remain prereleases and do not replace the normal update channel. HACS should no longer advertise each main-branch commit as an update. **Need a different version?** is still available for deliberate version selection, including the retained `v0.1.0-dev.2`; it is not the routine update path. Repository topics and validation failures do not determine this channel selection.

Aviadilo requires the compiled `aviadilo.zip` asset attached to a versioned [GitHub Release](https://github.com/bishopdynamics/aviadilo/releases). A source push, tag alone, or unpublished draft does not provide that asset. [HACS version rules](https://www.hacs.xyz/docs/publish/start/#versions), [refresh/download controls](https://www.hacs.xyz/docs/use/repositories/dashboard/).

Update the single integration package through HACS, restart HA when requested, then reload browser dashboards. Backend and card versions travel together. Settings and the bounded public-data cache live outside the replaced integration directory.

If Aviadilo is missing from the card picker, confirm that its integration loaded and reload the dashboard. If external layers are unavailable, open the card's problem indicator or editor Live inspection and check the integration's configured anchor; people can still use HA state. A disabled Wind layer makes no wind requests. Wind or radar data can be unavailable even when aircraft work because sources are independent.

Use the integration's diagnostics download for aggregate scheduler/cache status. Cache clearing is a separate confirmed action in Configure; it affects every viewer and causes later requests to refill the cache. Avoid clearing it repeatedly when investigating a provider outage.

For development or offline acceptance, follow [the isolated HA guide](../dev/ha/README.md). Its clearly synthetic instance is separate from an existing household installation.
