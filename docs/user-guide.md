# Using Aviadilo

Aviadilo 0.2.0 combines aircraft, radar, wind, and household locations in one Home Assistant map. It targets Home Assistant 2026.9.1 and Chromium. Shared basemap caching and the same real data serve saved, editor and picker views; synthetic data is confined to the developer test harness.

## Installation

1. In HACS, add `https://github.com/bishopdynamics/aviadilo` as a custom repository with type **Integration**. Download the latest normal release (`v0.2.0`). If already installed, use the ordinary Update action. Restart Home Assistant when requested.
2. Open **Settings → Devices & services → Add integration → Aviadilo**. Choose the shared collection anchor, aircraft provider, radius, and cache settings. Leave conservative provider pacing at its defaults unless you want slower collection.
3. Reload the dashboard in your browser. Edit the dashboard, add a card, and select **Aviadilo**. The integration loads its matching card automatically; no manual JavaScript resource is needed.
4. Use the graphical editor to choose layers and add your `person` or `device_tracker` entities under People. **Save the card, then click Done to leave dashboard edit mode.**

The card picker, card editor and dashboard edit mode use the same HA states, source fetching and shared caches as the saved card. **Done** exits dashboard editing. Missing HA context, integration or source data produces a real loading/unavailable state. HA may recreate its preview card after a settings change, which creates a new viewer while shared data/cache remains available.

## Upgrading to 0.2.0

Use the normal HACS **Update** action from 0.1.0 or any 0.2.0 prerelease. If the new version is missing, use Aviadilo’s three-dot menu → **Update information**. Restart HA and reload dashboard browsers before editing card settings. Existing dashboards load through an in-memory migration; a normal editor save stores version-2 card configuration, which an old cached frontend cannot read. Integration settings and the shared cache are retained.

The 0.2.0 release has the same functionality as the signed-off 0.2.0-dev.7 prerelease.

Legacy combined wind markers and particles become **Particles**. Legacy wind settings that drew nothing become **Arrows**, while preserving whether the Wind layer is enabled.

## Optional tile-streaming prerelease

`0.2.1-dev.2` improves tile recovery and sharing across kiosks. Select it explicitly in HACS under **Need a different version? → Release**, restart Home Assistant and reload dashboard browsers. Normal `0.2.0` remains the stable release during testing.

Visible basemap tiles retry temporary capacity/connection failures with controlled backoff. Cached tiles can load while uncached tiles wait for the provider, including when several kiosks share one HA login. Fresh basemap images can be reused for up to one hour after navigating away, within a bounded memory cache. Tiles must still be fresh according to their HTTP expiry; the one-hour idle window never extends that expiry. Returning checks the current integration/cache identity before reuse; a cache clear invalidates retained images. This navigation cache does not retain household photos or keep map requests running while the card is closed.

A previously unseen area can still load progressively because new OpenStreetMap requests remain paced. Existing **OpenStreetMap minimum interval** settings affect upstream fetching; local queuing and cache reuse need no new setting. Temporary retries do not bypass provider cooldowns.

## Checking the saved card

Saved and editor cards should load real basemap tiles, selected HA trackers and enabled provider layers. The published integration does not contain the development provider shim. A **Synthetic · offline preview** badge or fabricated DEMO/Alex/Sam data indicates the older prerelease/frontend is still loaded; confirm the update, restart HA and reload the browser.

Defaults: aircraft and people layers are enabled; radar and wind are disabled. People has no trackers selected initially. Enabling Wind displays arrows by default; choose Arrows, Barbs or Particles in the editor. Leave provider pacing unchanged while testing, and allow initial loading to finish.

| Check | Action and expected result |
| --- | --- |
| Connection and basemap | Look for real roads/place labels around your configured HA home/anchor in either viewing or editing. A healthy card has no routine status panel; a problem indicator provides failure details. Cached revisits should load promptly; genuinely new tiles remain paced by the integration. |
| Aircraft | Select a callsign in the list and its marker; both should select the same aircraft and show details, including configured position-age fields. Confirm distances make sense for your collection area. Empty results can be legitimate; defaults exclude aircraft on the ground. |
| People | Add known person or device_tracker entities and compare displayed positions with HA. Start with one nearby person. The default 50 km filter intentionally excludes distant people before fitting the map. |
| Radar | Enable Radar and keep RainViewer for the first check. Choose Latest or Loop in the editor. Its Live inspection shows the displayed frame time, matching legend and coverage. Historical radar must not rewind people or aircraft. No precipitation over your area can be legitimate; loading/unavailable is a separate state. |
| Wind | Enable Wind and choose arrows first, then optionally particles. Choose a visible wind color. Live inspection shows DWD ICON-global information and model-valid time. Reduced motion displays static arrows while preserving a saved Particles setting. |
| View and persistence | Pan/zoom manually and ensure ordinary updates preserve the view; Recenter should restore the configured view. Save a title/unit/filter change, click Done, reload and verify it persists. Test list collapse and narrow/touch layout without overlapping cards or losing map controls. |
| Recovery | Navigate away and back or reload the dashboard. Enabled layers should resume without duplicate markers or persistent loading. Repeated cache clearing is unnecessary. |

Missing aircraft metadata, a wind model run marked unknown, and unavailable coverage detail are explicit missing-information states. They are not unimplemented placeholders. Flight route/photo enrichment and synchronized historical people/aircraft replay are outside this release.

The combined-card automated and isolated HA endurance checks used synthetic provider responses; bounded real provider checks were separate. If a check fails, record whether you were editing or viewing, which layer/source was affected, its exact status text and the action that triggered it.

## Map and layer controls

The layer buttons change visibility for the current card session. Save defaults through the card editor. Under Map, turn off **Show layer buttons** to use fixed saved layer selections. **Show recenter button** is independent; turn both off for a clean map. Use the map layout if you also want to omit the aircraft list. Aircraft and people remain current while you view older radar frames; there is no synchronized historical people or aircraft replay.

- **Aircraft:** tap a marker or list callsign for details. The list can collapse; choose map, list, or combined layout in the editor. Altitude, distance, age and airborne filters apply before drawing and automatic fitting. Unknown values remain distinct from zero.
- **Radar:** RainViewer is the default; NOAA MRMS and KSOX are alternatives. Choose Latest or automatic Loop, history length, frame duration and opacity in the editor. Live inspection provides the displayed timestamp, legend and coverage. Aircraft and people stay current during radar playback.
- **Wind:** choose exactly one of Arrows, Barbs or Particles in the editor, plus color and opacity. Marker size/spacing or particle count/speed/trail controls appear for the selected mode; switching retains their saved values. Arrows and particles follow the wind; barbs show where it comes from. Reduced motion uses arrows without changing the saved mode. Wind has its own forecast-valid time.
- **People:** prefer existing `person` entities for household members so Home Assistant chooses among their associated trackers. Direct `device_tracker` selections remain supported. Under **Selected people and device trackers**, change the entity in an existing row to retain its custom name, color, icon and photo preference. The default 50 km radius excludes distant travellers before drawing and fitting; a missing configured anchor hides radius-filtered people. A person without coordinates can use its first reported active zone, labelled **Zone location · GPS age unknown**. Missing/passive zones cannot supply a point.

Overlapping people/device icons and the reference pin spread apart automatically. Thin connectors show their real locations; the visual offsets do not change location data or accuracy circles. Enable **People → Group overlapping markers** if you prefer a counted group. Activate the count to show individual icons; Escape or a map-background tap collapses it. A count includes the reference pin when present. Small maps or large groups use a scrollable member panel with individual details.

Choose **Map → Map view mode → Auto-fit people/devices** to fit the people/device locations remaining after your radius and freshness filters. Aircraft, the reference pin and separately included zones do not enlarge this view. Empty selections fall back to the configured home extent. **Auto-fit visible items** retains the broader existing fit behavior. Manual pan/zoom pauses automatic fitting until Recenter or the configured idle return.

The **You are here** pin is enabled by default at the configured map anchor: Home Assistant home unless you select a zone or custom coordinates. It stays at that geographic location when you pan. Turn off **Show “You are here” marker** under Map to hide it, independently of the data layers and layer buttons. The pin identifies the configured reference, not the viewing device’s GPS location; it disappears if the anchor is unavailable.

Under **Aircraft → Aircraft types**, check the groups you want to see: Airplanes, Helicopters, Gliders, Balloons / airships, Parachutists, Ultralights / hang-gliders / paragliders, Drones, Spacecraft, Ground vehicles / obstacles and Unknown. All start enabled; checking only Helicopters filters the map, aircraft list and fit candidates to that group. Unchecking every type hides all aircraft. Hiding a selected type clears its details and trail. These are per-card display filters using the existing shared feed.

Icons follow the reported aircraft category, with distinct plane/helicopter shapes and a neutral Unknown symbol for missing or unrecognized categories. Model names remain available in aircraft details. Known courses rotate directional icons; a question-mark badge marks missing course. Aircraft type, size/color, stale styling and keyboard selection remain independent.

Enable **Auto-size height to page** under Map to fill the remaining visible page below the card. It adapts to resizing and respects fixed scroll-container limits, including editor previews. Fixed pixel height remains the default and is retained when auto sizing is off. The minimum map height is 160px; tall titles/controls/aircraft details can still require scrolling. Scrolling alone does not grow the card.

Choose **Follow Home Assistant**, **light** or **dark** under Map theme. Theme and wind-color changes reuse existing tiles and data.

A healthy card keeps its controls, optional aircraft list and source credits visible without routine weather/status panels. After the initial loading grace, **Map data needs attention** opens read-only causes, timestamps and recovery guidance. Close it with Escape, the close button or a tap outside. Use **Live inspection** in the editor for healthy weather details.

Dragging or zooming suspends automatic fitting. Recenter returns to the configured view; an optional idle timeout can return automatically. Weather never independently recenters the map. Hidden cards stop requesting external layers and stop animation.

## Shared collection and local display

**Settings → Devices & services → Aviadilo → Configure** changes the shared collection area, aircraft source, requested refresh interval, cache budget and provider pacing. These settings affect every card. Aircraft background collection is optional; radar and wind require a visible viewer.

The card editor controls that card's view, filters, units, layers and presentation. Expanding the view does not enlarge the integration's aircraft collection area. Display changes reuse available data. Multiple viewers share provider queues and cached responses; source limits can make effective refresh slower than the requested interval.

## Updates and troubleshooting

A blank basemap with **Refusing to allow … to subscribe to event aviadilo/assets_changed** is a permissions bug in releases through v0.2.0-dev.2. Update to v0.2.0-dev.3 or later, restart HA and reload the kiosk page. Keep the kiosk's existing regular/read-only role: MQTT and administrator permissions are not involved. Browser cache/profile clearing alone cannot correct this server-side refusal. The fixed version uses a dedicated authenticated metadata subscription while preserving HA's event and entity access restrictions.

If HACS still offers a commit hash, its metadata may reflect the former prerelease-only repository. On Aviadilo's entry, open the three-dot menu and choose **Update information**, then install the `v0.1.0` update. This refresh changes version metadata; it does not install files by itself. After downloading, restart HA and reload the dashboard. See [HACS metadata refresh](https://www.hacs.xyz/docs/use/repositories/dashboard/#updating-repository-metadata).

Normal releases use tags such as `v0.1.0`; development versions remain prereleases and do not replace the normal update channel. HACS should no longer advertise each main-branch commit as an update. **Need a different version?** is still available for deliberate version selection, including the retained `v0.1.0-dev.2`; it is not the routine update path. Repository topics and validation failures do not determine this channel selection.

Aviadilo requires the compiled `aviadilo.zip` asset attached to a versioned [GitHub Release](https://github.com/bishopdynamics/aviadilo/releases). A source push, tag alone, or unpublished draft does not provide that asset. [HACS version rules](https://www.hacs.xyz/docs/publish/start/#versions), [refresh/download controls](https://www.hacs.xyz/docs/use/repositories/dashboard/).

Update the single integration package through HACS, restart HA when requested, then reload browser dashboards. Backend and card versions travel together. Settings and the bounded public-data cache live outside the replaced integration directory.

If Aviadilo is missing from the card picker, confirm that its integration loaded and reload the dashboard. If external layers are unavailable, open the card's problem indicator or editor Live inspection and check the integration's configured anchor; people can still use HA state. A disabled Wind layer makes no wind requests. Wind or radar data can be unavailable even when aircraft work because sources are independent.

Use the integration's diagnostics download for aggregate scheduler/cache status. Cache clearing is a separate confirmed action in Configure; it affects every viewer and causes later requests to refill the cache. Avoid clearing it repeatedly when investigating a provider outage.

For development or offline acceptance, follow [the isolated HA guide](../dev/ha/README.md). Its clearly synthetic instance is separate from an existing household installation.
