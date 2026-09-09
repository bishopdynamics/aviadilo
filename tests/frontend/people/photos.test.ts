import { expect, it, vi } from 'vitest';
vi.mock('leaflet', () => ({
  layerGroup: () => ({ addTo() {}, clearLayers() {}, remove() {} }),
}));
import { PeopleLayer, photoKind } from '../../../src/layers/people/layer';
it('keeps HA pictures first-party and sends only supported external addresses to the entity gateway', () => {
  const origin = 'https://ha.example';
  for (const value of [
    '/api/image_proxy/device_tracker.alex',
    '/local/avatar.png',
    'https://ha.example/photo?key=x',
  ])
    expect(photoKind(value, origin)).toBe('first-party');
  expect(photoKind('https://photos.example/avatar?secret=x', origin)).toBe(
    'external',
  );
  for (const value of [
    'http://192.168.1.1/photo',
    '//photos.example/x',
    'javascript:alert(1)',
    'data:image/png,x',
    'https://user:pass@photos.example/x',
    'https://photos.example/x#y',
    'https://photos.example/\\x',
    'https://photos.example/a b',
  ])
    expect(photoKind(value, origin)).toBe('unsupported');
});

it('raw missing-hass cards do not read a viewport before an anchor exists', () => {
  const map = { getZoom: () => undefined, getBounds: vi.fn() };
  const layer = new PeopleLayer(map as unknown as import('leaflet').Map);
  expect(() => layer.update([], {})).not.toThrow();
  expect(map.getBounds).not.toHaveBeenCalled();
  layer.dispose();
});
