import { afterEach, expect, it, vi } from 'vitest';
import { AIRCRAFT_KINDS } from '../../../src/layers/aircraft/classification';
import {
  createAircraftSymbol,
  updateAircraftSymbol,
} from '../../../src/layers/aircraft/icons';

// Minimal SVG DOM boundary: exercise incremental updates without a browser dependency.
class SvgNode {
  attributes = new Map<string, string>();
  children: SvgNode[] = [];
  style = {};
  setAttribute = vi.fn((name: string, value: string) =>
    this.attributes.set(name, value),
  );
  append(...nodes: SvgNode[]) {
    this.children.push(...nodes);
  }
}
afterEach(() => vi.unstubAllGlobals());
it('keeps SVG and glyph identity, updates glyph only for kind changes and explicitly marks unknown heading', () => {
  const createElementNS = vi.fn(() => new SvgNode());
  vi.stubGlobal('document', { createElementNS });
  const symbol = createAircraftSymbol();
  const path = symbol.path as unknown as SvgNode;
  const shape = symbol.shape as unknown as SvgNode;
  const badge = symbol.unknownCourse as unknown as SvgNode;
  const svg = symbol.svg as unknown as SvgNode;
  const created = createElementNS.mock.calls.length;
  updateAircraftSymbol(symbol, 'airplanes', 0);
  const plane = path.attributes.get('d');
  expect(shape.attributes.get('transform')).toBe('rotate(0 16 16)');
  path.setAttribute.mockClear();
  updateAircraftSymbol(symbol, 'airplanes', 275);
  expect(path.setAttribute).not.toHaveBeenCalled();
  expect(shape.attributes.get('transform')).toBe('rotate(275 16 16)');
  updateAircraftSymbol(symbol, 'helicopters', 90);
  expect(path.attributes.get('d')).not.toBe(plane);
  expect(svg.attributes.get('data-aircraft-kind')).toBe('helicopters');
  updateAircraftSymbol(symbol, 'helicopters', null);
  expect(shape.attributes.get('transform')).toBe('');
  expect(badge.attributes.get('display')).toBe('inline');
  expect(svg.attributes.get('data-course-known')).toBe('false');
  expect(path.attributes.get('d')).toBeTruthy();
  updateAircraftSymbol(symbol, 'helicopters', 0);
  expect(badge.attributes.get('display')).toBe('none');
  const paths = AIRCRAFT_KINDS.map((kind) => {
    updateAircraftSymbol(symbol, kind, null);
    return path.attributes.get('d');
  });
  expect(new Set(paths).size).toBe(10);
  expect(createElementNS).toHaveBeenCalledTimes(created);
  expect(symbol.path).toBe(path);
  expect(svg.children[0]).toBe(shape);
});
