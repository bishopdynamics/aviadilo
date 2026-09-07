import { describe, expect, it } from 'vitest';
import { isCardPickerPreview } from '../../../src/map/ha-preview';
describe('HA picker preview compatibility', () => {
  it('detects the picker through light DOM and shadow hosts', () => {
    const picker = { localName: 'hui-card-picker' };
    const shadow = { host: picker };
    const card = {
      localName: 'aviadilo-map',
      parentNode: { localName: 'div', parentNode: shadow },
    };
    expect(isCardPickerPreview(card)).toBe(true);
  });
  it('does not treat the actual dashboard or generic editor ancestors as a picker', () => {
    expect(
      isCardPickerPreview({
        localName: 'aviadilo-map',
        parentNode: {
          localName: 'hui-card',
          parentNode: { localName: 'hui-view' },
        },
      }),
    ).toBe(false);
    expect(isCardPickerPreview({ localName: 'aviadilo-map' })).toBe(false);
  });
  it('re-evaluates context after the same card moves to the dashboard', () => {
    const card = {
      localName: 'aviadilo-map',
      parentNode: { localName: 'hui-card-picker' },
    };
    expect(isCardPickerPreview(card)).toBe(true);
    card.parentNode = { localName: 'hui-card' };
    expect(isCardPickerPreview(card)).toBe(false);
  });
});
