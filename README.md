# Aviadilo

Aircraft, weather and household locations on one Home Assistant map. Aviadilo works on desktop dashboards and wall displays, with a visual editor for all settings.

- **Aircraft:** see nearby planes and helicopters, open their details, and filter by aircraft type.
- **Weather:** add rain radar and wind arrows, barbs or animated particles.
- **People:** show people already tracked by Home Assistant, keep distant travellers out of the view, and spread overlapping icons apart.
- **Your layout:** choose light or dark maps, hide layer buttons, or let the map fill the page height.

[Latest release](https://github.com/bishopdynamics/aviadilo/releases/latest) · [Full user guide](docs/user-guide.md) · [Report a problem](https://github.com/bishopdynamics/aviadilo/issues)

## Before you start

- **Home Assistant 2026.9.1 or newer.** Chromium is the tested browser.
- **HACS installed and configured.** If you need it, follow the [HACS installation guide](https://www.hacs.xyz/docs/use/download/download/) first.
- An **administrator account** for installation and setup. Configured maps can be viewed by regular and read-only users.
- Internet access for map tiles, aircraft and weather data.
- To show people, existing Home Assistant **person** or **device_tracker** entities with locations.

## Set up Aviadilo

### 1. Install through HACS

Use this repository URL:

```text
https://github.com/bishopdynamics/aviadilo
```

1. Open **HACS** in Home Assistant.
2. Open the **⋮** menu at the top right and choose **Custom repositories**.
3. Paste the URL above, select **Integration** as the type, and choose **Add**. This download includes the dashboard card too.
4. Find **Aviadilo** in HACS and **Download** the latest normal release.
5. **Restart Home Assistant.**

[HACS custom-repository help](https://www.hacs.xyz/docs/faq/custom_repositories/).

### 2. Set up the integration

1. Open **Settings → Devices & services → Add integration**.
2. Search for **Aviadilo** and select it.
3. For a first setup, leave **Location anchor** set to **home** to use your Home Assistant home location. Keep the other defaults and submit the form.
4. On **Conservative provider pacing**, keep the defaults and submit to finish setup.

Set up the integration once. You can change the collection area later through **Settings → Devices & services → Aviadilo → Configure**.

### 3. Add your map to a dashboard

1. **Reload your browser page** after integration setup.
2. Open a dashboard you can edit. To create a dedicated one, go to **Settings → Dashboards → Add dashboard → New dashboard from scratch**, name it **Aviadilo**, and create it. Enable **Add to sidebar** if you want a sidebar shortcut.
3. On that dashboard, choose **Edit dashboard**, then **Add card**. In the card picker, choose **By card**, search for **Aviadilo**, and select it.
4. In the card editor, open **People** and add a nearby **person** entity. Direct **device_tracker** entities work too. Skip this if you only want aircraft and weather.
5. **Save** the card, then click **Done** to leave dashboard editing.

The card loads automatically with the integration. All setup above uses the graphical interface; no YAML or manual JavaScript resource is needed. [Home Assistant dashboard help](https://www.home-assistant.io/dashboards/dashboards/#creating-a-new-dashboard).

## Your first map

Aircraft and People are enabled by default; Radar and Wind start disabled. People only appear after you select their entities in the card editor. The default **50 km people filter** intentionally hides distant household members.

Check that roads and place names match your area, then enable Radar or Wind in the editor if you want them. New map areas can load progressively; returning to a recently viewed area uses cached tiles. Aircraft appear when matching aircraft are available in the collection area.

The **You are here** pin marks the map's configured reference point—Home Assistant home by default. Overlapping household icons spread apart, with outlined lines back to their real locations.

A few useful options in the card editor:

| Want to… | Setting |
| --- | --- |
| Fit the map to nearby household members | **Map → Map view mode → Auto-fit people/devices** |
| Keep a clean map with fixed layers | Turn off **Map → Show layer buttons** |
| Fill the available page height | Turn on **Map → Auto-size height to page** |
| Show only helicopters | Under **Aircraft → Aircraft types**, select only **Helicopters** |

The [full user guide](docs/user-guide.md) covers weather sources, filters, grouping, themes and other settings.

## Updates

Use **Update** on Aviadilo in HACS, restart Home Assistant, then reload your dashboard browsers. Your integration settings, cards and shared cache are retained.

If an update is missing, open Aviadilo's **⋮ → Update information** menu in HACS and check again. [Release notes](https://github.com/bishopdynamics/aviadilo/releases) describe changes and any extra upgrade steps.

## Need help?

| Problem | What to check |
| --- | --- |
| Aviadilo is missing from **Add integration** | Confirm HACS finished downloading it as an **Integration**, then restart HA. |
| Aviadilo is missing from the card picker | Finish integration setup in step 2, then reload the browser page. |
| A person is missing | Select their entity in the card editor, check its location in HA, and check the people-radius filter. |
| A layer is unavailable or tiles stay blank | Open **Map data needs attention** on the card or **Live inspection** in the editor for the specific cause. |

See [detailed troubleshooting](docs/user-guide.md#updates-and-troubleshooting) or [open an issue](https://github.com/bishopdynamics/aviadilo/issues). Include your Aviadilo and HA versions, browser/device, steps to reproduce, and the exact message. Remove personal details from screenshots shared publicly.

## Contributing

See the [developer guide](docs/development.md) for source setup, testing, architecture and release tooling.

Licensed under the [MIT License](LICENSE).
