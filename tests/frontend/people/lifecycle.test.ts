import { beforeEach, expect, it, vi } from 'vitest';
import type { PersonPoint } from '../../../src/layers/people/model';
import type { DecodedAssets } from '../../../src/data/assets';

const fake = vi.hoisted(() => {
  class Element extends EventTarget {
    className = '';
    textContent = '';
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    attributes = new Map<string, string>();
    children: Element[] = [];
    parentElement?: Element;
    classList = { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() };
    setAttribute(key: string, value: string) {
      this.attributes.set(key, value);
    }
    removeAttribute(key: string) {
      this.attributes.delete(key);
    }
    append(...elements: Element[]) {
      for (const element of elements) {
        element.remove();
        element.parentElement = this;
        this.children.push(element);
      }
    }
    replaceChildren(...elements: Element[]) {
      this.children.forEach((child) => (child.parentElement = undefined));
      this.children = [];
      this.append(...elements);
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (child) => child !== this,
        );
      this.parentElement = undefined;
    }
    querySelector(selector: string): Element | null {
      return (
        this.children.find((child) => child.className === selector.slice(1)) ??
        null
      );
    }
  }
  const pane = new Element();
  const markers: Marker[] = [];
  class Marker {
    element = new Element();
    popup?: Element;
    tooltip?: Element;
    removed = false;
    closePopup = vi.fn();
    openPopup = vi.fn();
    setLatLng = vi.fn();
    constructor(
      readonly point: number[],
      readonly options: { icon: { html: Element } },
    ) {
      this.element.append(options.icon.html);
      markers.push(this);
    }
    addTo(group: { layers: Marker[] }) {
      group.layers.push(this);
      pane.append(this.element);
      return this;
    }
    getElement() {
      return this.element;
    }
    bindPopup(content: Element) {
      this.popup = content;
    }
    getPopup() {
      return { getContent: () => this.popup };
    }
    bindTooltip(content: Element) {
      this.tooltip = content;
    }
    getTooltip() {
      return this.tooltip;
    }
    unbindTooltip() {
      this.tooltip = undefined;
    }
    remove() {
      this.removed = true;
      this.element.remove();
    }
  }
  const circles: {
    point: number[];
    radius: number;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  return { Element, pane, Marker, markers, circles };
});
vi.mock('leaflet', () => ({
  layerGroup: () => ({
    layers: [] as { remove(): void }[],
    addTo() {
      return this;
    },
    clearLayers() {
      this.layers.forEach((layer) => layer.remove());
      this.layers = [];
    },
    remove() {},
  }),
  divIcon: (options: unknown) => options,
  marker: (
    point: number[],
    options: ConstructorParameters<typeof fake.Marker>[1],
  ) => new fake.Marker(point, options),
  circle: (point: number[], options: { radius: number }) => {
    const circle = {
      point,
      radius: options.radius,
      remove: vi.fn(),
      addTo() {
        return this;
      },
      setLatLng(next: number[]) {
        this.point = next;
      },
      setRadius(radius: number) {
        this.radius = radius;
      },
    };
    fake.circles.push(circle);
    return circle;
  },
}));
import { PeopleLayer } from '../../../src/layers/people/layer';
import { pictureKey } from '../../../src/data/assets';
const original: PersonPoint = {
  entityId: 'person.alex',
  latitude: 34.1,
  longitude: -117.72,
  name: 'Alex',
  color: '#123456',
  photo: 'https://photos.example/alex?private=secret',
  accuracyM: 12,
  stale: false,
  timestamp: '2026-09-09T10:00:00Z',
  timestampKind: 'position',
  locationKind: 'coordinates',
};
beforeEach(() => {
  fake.markers.length = 0;
  fake.circles.length = 0;
  vi.stubGlobal('HTMLElement', fake.Element);
  vi.stubGlobal('document', { createElement: () => new fake.Element() });
  vi.stubGlobal('location', { origin: 'https://ha.example' });
});
function setup() {
  let picture = original.photo;
  let invalidate = () => {};
  const release = vi.fn();
  const controller = new AbortController();
  const acquire = vi.fn(async () => ({
    url: 'blob:authorized',
    current: () => true,
    signal: controller.signal,
    release,
  }));
  const assets = {
    acquire,
    client: {
      observe: (fn: () => void) => {
        invalidate = fn;
        return vi.fn();
      },
    },
    observeCapacity: () => vi.fn(),
  };
  const layer = new PeopleLayer({
    getZoom: () => 9,
    getCenter: () => ({ lng: -117.72 }),
    getBounds: () => ({ contains: () => true }),
    getPane: () => fake.pane,
  } as unknown as import('leaflet').Map);
  layer.setAssets(assets as unknown as DecodedAssets, 'entry', () => ({
    states: {
      'person.alex': { state: 'home', attributes: { entity_picture: picture } },
    },
  }));
  return {
    layer,
    acquire,
    release,
    invalidate: () => invalidate(),
    picture: (next: string) => (picture = next),
  };
}
it('keeps marker, photo and popup identity through timestamps, zone/accuracy updates and display moves', async () => {
  const { layer, acquire, release } = setup();
  layer.update([original], { show_labels: true, accuracy_circles: true });
  await Promise.resolve();
  const marker = fake.markers[0],
    popup = marker.popup;
  const image = marker.options.icon.html.children[0];
  const host = new fake.Element();
  const next = {
    ...original,
    timestamp: '2026-09-09T11:00:00Z',
    stale: true,
    latitude: 34.2,
    accuracyM: 25,
  };
  layer.update(
    [next],
    { show_labels: true, accuracy_circles: true },
    new Map([
      [
        original.entityId,
        {
          point: { latitude: 34.3, longitude: -117.8 },
          host: host as unknown as HTMLElement,
        },
      ],
    ]),
  );
  expect(fake.markers).toHaveLength(1);
  expect(marker.popup).toBe(popup);
  expect(marker.options.icon.html.children[0]).toBe(image);
  expect(marker.element.parentElement).toBe(host);
  expect(marker.setLatLng).toHaveBeenLastCalledWith([34.3, -117.8]);
  expect(fake.circles[0].point).toEqual([34.2, -117.72]);
  expect(fake.circles[0].radius).toBe(25);
  expect(acquire).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  const zone = {
    ...next,
    locationKind: 'zone' as const,
    zoneId: 'zone.home',
    zoneName: 'Home',
    timestampKind: 'updated' as const,
    accuracyM: null,
  };
  layer.update([zone], { accuracy_circles: true });
  expect(
    marker.popup?.querySelector('.person-location')?.textContent,
  ).toContain('GPS age unknown');
  expect(fake.circles[0].remove).toHaveBeenCalled();
  expect(marker.element.parentElement).toBe(fake.pane);
  layer.dispose();
  expect(release).toHaveBeenCalledTimes(1);
  expect(marker.removed).toBe(true);
});
it('keeps authenticated picture-key validation and releases removed or invalidated resources', async () => {
  const { layer, acquire, release, picture, invalidate } = setup();
  layer.update([original], {});
  await Promise.resolve();
  const call = acquire.mock.calls[0] as unknown as [
    unknown,
    AbortSignal,
    () => boolean,
  ];
  expect(call[0]).toEqual({
    kind: 'photo',
    entity_id: original.entityId,
    picture_key: pictureKey(original.photo!),
    entry_id: 'entry',
  });
  expect(call[2]()).toBe(true);
  picture('https://photos.example/replacement');
  expect(call[2]()).toBe(false);
  invalidate();
  expect(release).toHaveBeenCalledTimes(1);
  expect(call[1].aborted).toBe(true);
  layer.update([], {});
  expect(fake.markers[0].removed).toBe(true);
  layer.dispose();
  expect(release).toHaveBeenCalledTimes(1);
});
it('removes reparented fallback details when photo identity changes or the member disappears', async () => {
  const { layer } = setup();
  const host = new fake.Element();
  const placements = new Map([
    [original.entityId, { host: host as unknown as HTMLElement }],
  ]);
  layer.update([original], {}, placements);
  await Promise.resolve();
  fake.markers[0].element.dispatchEvent(new Event('click'));
  const oldDetails = fake.markers[0].popup!;
  expect(oldDetails.parentElement).toBe(host);
  layer.update([{ ...original, name: 'New name' }], {}, placements);
  expect(oldDetails.parentElement).toBeUndefined();
  fake.markers[1].element.dispatchEvent(new Event('click'));
  const newDetails = fake.markers[1].popup!;
  expect(newDetails.parentElement).toBe(host);
  layer.update([], {});
  expect(newDetails.parentElement).toBeUndefined();
  layer.dispose();
});
