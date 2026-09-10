# First install and feedback

Aviadilo puts aircraft, weather and household locations on one Home Assistant map. Version **0.2.1** is the normal HACS release.

## Before starting

- Home Assistant **2026.9.1 or newer**, with HACS installed. The current tested baseline is HA 2026.9.1 and Chromium.
- Existing `person` or `device_tracker` entities if you want to show household members. Aviadilo displays their HA locations; it does not set up phone tracking.

## Install

1. In HACS, add **https://github.com/bishopdynamics/aviadilo** as a custom repository with type **Integration**. Download the normal **v0.2.1** release and restart Home Assistant.
2. Open **Settings → Devices & services → Add integration → Aviadilo**. Choose the collection area and keep the default provider pacing initially.
3. Reload your dashboard browser. Edit a dashboard, add a card and choose **Aviadilo**. The integration loads its matching card automatically.
4. In the graphical editor, select a nearby `person` entity under People; direct `device_tracker` entities also work. Save, then click **Done** to leave dashboard editing.

Start with the basemap, Aircraft and one nearby person. The default people-radius filter is 50 km, so a distant person may be intentionally hidden. Radar and Wind start disabled; enable them separately once the basic map is working. A new area can load progressively while uncached tiles are fetched.

For an existing installation, use the normal HACS **Update** action, restart HA and reload dashboards. See the [full user guide](user-guide.md) for layout, aircraft types, weather, people filters and troubleshooting.

## Useful first feedback

- Was installation clear, and did Aviadilo appear in the card picker without adding a manual JavaScript resource?
- Do the map, people locations and aircraft look correct? Compare a person with HA's stock map if something seems wrong.
- Do overlapping icons and connector lines make the locations understandable?
- Does navigating away and back reload promptly? Do any tiles stay blank?
- Does the card remain readable and usable on your usual screen, including any touch display?

For a problem, record the Aviadilo and HA versions, browser/device, whether you were editing or viewing, steps to reproduce, and the exact message in **Map data needs attention** or the editor's **Live inspection**. A screenshot can help; remove household locations or names before sharing it publicly. Feedback can go to the person who shared Aviadilo with you, or to [GitHub Issues](https://github.com/bishopdynamics/aviadilo/issues).
