import cases from '../contracts/fixtures/cases.json';
import '../src/aviadilo-map';
import type { AviadiloMap } from '../src/aviadilo-map';

const card = document.querySelector<AviadiloMap>('aviadilo-map');
if (card) {
  card.setConfig({ schema_version: 1, type: 'custom:aviadilo-map' });
  card.fixtureSummary = cases
    .filter((item) => item.valid && item.schema === 'event')
    .map((item) => item.name);
}
