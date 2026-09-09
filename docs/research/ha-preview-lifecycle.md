# Home Assistant preview lifecycle

Native verification on HA 2026.9.1 / frontend 20260826.6 found that HA replaces a custom card's preview element after every changed editor configuration, even when only Title changes. This is independent of Aviadilo's data pipeline.

The installed `hui-card` implementation calls `_loadElement` when the card type changes **or** its `preview` property is true. `_loadElement` creates a new element and removes the old children. A saved card outside preview instead receives `setConfig` on its existing element. The native editor forwards a frozen changed configuration; suppressing the event or mutating its identity would prevent correct preview updates/saving.

Evidence was extracted from the installed frontend, without modifying HA:

- `2467.fa2ac54b2ee27a67.js`: `hui-dialog-edit-card` binds its configuration to a `hui-card` with preview enabled.
- `56076.f4674cceed9a0ab5.js`: `hui-card` chooses replacement for changed preview configurations.
- `84664.16f376a18ad1300b.js`: the editor wrapper filters unchanged values and forwards normal configuration changes.
- Readable extracts and the detailed investigation: `/tmp/aviadilo-kiosk-slice3/ha-edit-source/`.

In the native test, changing Title replaced the Aviadilo element and its per-element weather client, adding one viewer subscription. The connection-scoped asset client and decoded cache remained the same while the other visible card retained ownership. Tracker identities/timestamps, source data, photos and the configured view matched. No synthetic or cache-only data path was used. Ordinary `setConfig` updates on a surviving Aviadilo element preserve its clients and manual viewport.

The approved kiosk spec's literal no-new-client guarantee across ordinary edits therefore needs a user decision. A question is pending: accept HA-forced replacements as normal removals/new viewers, or specify a general session handoff between replacement elements. Such a handoff would need stable owner identity, callback/current-HA retargeting, bounded lifetime, viewport transfer, and unambiguous cleanup across all contexts. No editor-specific data branch or patch to HA's private components is proposed.

This finding does not change the requirement that saved, dashboard-edit, card-editor and picker views use exactly the same real HA state, clients, authentication, shared cache, upstream fetching and refresh rules.
