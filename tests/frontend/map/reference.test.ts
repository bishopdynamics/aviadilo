import { beforeEach, describe, expect, it, vi } from 'vitest';

const leaflet = vi.hoisted(() => {
  const markers: Array<{
    point: number[];
    options: Record<string, unknown>;
    removed: boolean;
    popup?: HTMLElement;
    popupOptions?: Record<string, unknown>;
    setLatLng: ReturnType<typeof vi.fn>;
  }> = [];
  const marker = vi.fn((point: number[], options: Record<string, unknown>) => {
    const value: (typeof markers)[number] & {
      addTo: ReturnType<typeof vi.fn>;
      bindPopup: ReturnType<typeof vi.fn>;
      getPopup: ReturnType<typeof vi.fn>;
      getElement: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    } = {
      point,
      options,
      removed: false,
      setLatLng: vi.fn((next: number[]) => {
        value.point = next;
      }),
      addTo: vi.fn(() => value),
      bindPopup: vi.fn(
        (popup: HTMLElement, popupOptions: Record<string, unknown>) => {
          value.popup = popup;
          value.popupOptions = popupOptions;
        },
      ),
      getPopup: vi.fn(() => ({ getContent: () => value.popup })),
      getElement: vi.fn(() => null),
      remove: vi.fn(() => {
        value.removed = true;
      }),
    };
    markers.push(value);
    return value;
  });
  return { marker, markers, divIcon: vi.fn((options) => options) };
});

vi.mock('leaflet', () => ({
  marker: leaflet.marker,
  divIcon: leaflet.divIcon,
}));

import { ReferenceLayer, referenceName } from '../../../src/map/reference';

class ElementStub {
  className = '';
  textContent = '';
  innerHTML = '';
  children: ElementStub[] = [];
  setAttribute() {}
  remove() {}
  append(...children: ElementStub[]) {
    this.children.push(...children);
  }
  querySelector(selector: string) {
    return selector === 'p'
      ? this.children.find((child) => child.tag === 'p')
      : null;
  }
  constructor(readonly tag = '') {}
}

beforeEach(() => {
  leaflet.marker.mockClear();
  leaflet.divIcon.mockClear();
  leaflet.markers.length = 0;
  vi.stubGlobal('HTMLElement', ElementStub);
  vi.stubGlobal('document', {
    createElement: (tag: string) => new ElementStub(tag),
  });
});

describe('map reference marker', () => {
  const map = {
    getZoom: () => 8,
    getCenter: () => ({ lng: 180 }),
  } as unknown as import('leaflet').Map;

  it('names home, zone and custom anchors without HTML interpolation', () => {
    expect(referenceName({ kind: 'home' })).toBe(
      'You are here — Home Assistant home',
    );
    expect(
      referenceName(
        { kind: 'zone', entity_id: 'zone.office' },
        {
          states: {
            'zone.office': {
              state: 'zoning',
              attributes: { friendly_name: '<Office>' },
            },
          },
        },
      ),
    ).toBe('You are here — configured map anchor: <Office>');
    expect(referenceName({ kind: 'custom', latitude: 0, longitude: 0 })).toBe(
      'You are here — configured map anchor',
    );
  });

  it('keeps one marker, wraps its longitude, restores it and cleans up', () => {
    const layer = new ReferenceLayer(map);
    const anchor = { kind: 'custom', latitude: 0, longitude: -179 } as const;
    layer.update({ latitude: 0, longitude: -179 }, anchor);
    expect(leaflet.marker).toHaveBeenCalledTimes(1);
    expect(leaflet.markers[0].point).toEqual([0, 181]);
    expect(leaflet.markers[0].options).toMatchObject({
      pane: 'context',
      keyboard: true,
      autoPanOnFocus: false,
      title: 'You are here — configured map anchor',
    });
    expect(leaflet.markers[0].popupOptions).toEqual({ autoPan: false });

    layer.update({ latitude: 1, longitude: 179 }, anchor);
    expect(leaflet.marker).toHaveBeenCalledTimes(1);
    expect(leaflet.markers[0].setLatLng).toHaveBeenCalledWith([1, 179]);
    layer.update(null, anchor);
    expect(leaflet.markers[0].removed).toBe(true);
    layer.update({ latitude: 0, longitude: 0 }, anchor);
    expect(leaflet.marker).toHaveBeenCalledTimes(2);
    layer.dispose();
    expect(leaflet.markers[1].removed).toBe(true);
  });

  it('does not touch the viewport while a map has no usable location', () => {
    const missingMap = {
      getZoom: () => undefined,
      getCenter: vi.fn(),
    } as unknown as import('leaflet').Map;
    const layer = new ReferenceLayer(missingMap);
    layer.update(null, { kind: 'home' });
    expect(missingMap.getCenter).not.toHaveBeenCalled();
    expect(leaflet.marker).not.toHaveBeenCalled();
  });
});
