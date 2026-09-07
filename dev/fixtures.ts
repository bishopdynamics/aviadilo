import '../src/aviadilo-map';
import type { AviadiloMap } from '../src/aviadilo-map';
import type { AviadiloEditor } from '../src/editor/editor';
import type { CardConfig } from '../src/config/types';
import { previewHass } from '../src/map/preview';
const card = document.querySelector<AviadiloMap>('aviadilo-map')!;
const editor = document.querySelector<AviadiloEditor>('aviadilo-map-editor')!;
const config: CardConfig = {
  schema_version: 1,
  type: 'custom:aviadilo-map',
  title: 'Household · synthetic preview',
  people: {
    trackers: [
      { entity_id: 'device_tracker.synthetic' },
      { entity_id: 'device_tracker.traveller' },
    ],
  },
};
card.preview = true;
card.fixtureHass = previewHass();
card.setConfig(config);
editor.hass = card.fixtureHass;
editor.setConfig(config);
editor.addEventListener('config-changed', (event) => {
  card.setConfig((event as CustomEvent<{ config: CardConfig }>).detail.config);
});
document.querySelector('#tokyo')!.addEventListener('click', () => {
  card.fixtureHass = previewHass(true);
  editor.hass = card.fixtureHass;
});
document.querySelector('#return')!.addEventListener('click', () => {
  card.fixtureHass = previewHass(false);
  editor.hass = card.fixtureHass;
});
