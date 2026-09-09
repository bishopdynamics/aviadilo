import { afterEach, expect, it, vi } from 'vitest';
import {
  layoutTop,
  pageBottom,
  PageHeightController,
  remainingMapHeight,
} from '../../../src/map/height';

afterEach(() => vi.unstubAllGlobals());

it('fills the remaining page including title, toolbar, borders and actual list height', () => {
  expect(remainingMapHeight(1000, 80, 150)).toBe(754);
  expect(remainingMapHeight(1000, 80, 250)).toBe(654);
  expect(remainingMapHeight(800, 700, 300)).toBe(160);
  expect(remainingMapHeight(4000, 80, 2)).toBe(3902);
  expect(remainingMapHeight(0, 0, 0)).toBeUndefined();
  expect(remainingMapHeight(800, NaN, 0)).toBeUndefined();
});

class FakeElement {
  assignedSlot: FakeElement | null = null;
  parentElement: FakeElement | null = null;
  parentNode: FakeElement | null = null;
  children: FakeElement[] = [];
  scrollTop = 0;
  isConnected = true;
  top = 0;
  width = 500;
  height = 480;
  root: unknown = {};
  getBoundingClientRect() {
    return { top: this.top, width: this.width, height: this.height };
  }
  getRootNode() {
    return this.root;
  }
}
class FakeShadowRoot extends EventTarget {
  constructor(readonly host: FakeElement) {
    super();
  }
}

it('restores nested, slotted and shadow scroll offsets without counting window scroll twice', () => {
  const documentRoot = new FakeElement();
  documentRoot.scrollTop = 100;
  const scrolling = new FakeElement();
  scrolling.scrollTop = 70;
  scrolling.parentElement = documentRoot;
  const slot = new FakeElement();
  slot.root = new FakeShadowRoot(scrolling);
  const article = new FakeElement();
  article.assignedSlot = slot;
  article.top = 30;
  vi.stubGlobal('ShadowRoot', FakeShadowRoot);
  vi.stubGlobal('window', { scrollY: 100 });
  vi.stubGlobal('document', { scrollingElement: documentRoot });
  expect(layoutTop(article as unknown as Element)).toBe(200);
  scrolling.scrollTop += 50;
  article.top -= 50;
  expect(layoutTop(article as unknown as Element)).toBe(200);
  window.scrollY += 20;
  article.top -= 20;
  expect(layoutTop(article as unknown as Element)).toBe(200);
});

it('coalesces geometry changes, stabilizes after its own resize, and cleans callbacks on detach', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  const observers: {
    callback: () => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  class Observer {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(readonly callback: () => void) {
      observers.push(this);
    }
  }
  const doc = Object.assign(new EventTarget(), { scrollingElement: null });
  const viewport = Object.assign(new EventTarget(), { height: 1000 });
  const win = Object.assign(new EventTarget(), {
    scrollY: 0,
    innerHeight: 1000,
    visualViewport: viewport,
  });
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('MutationObserver', Observer);
  vi.stubGlobal('ShadowRoot', FakeShadowRoot);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  const host = new FakeElement(),
    article = new FakeElement(),
    map = new FakeElement();
  const shadow = new FakeShadowRoot(new FakeElement());
  host.root = shadow;
  article.top = 80;
  let overhead = 102;
  article.height = map.height + overhead;
  const apply = vi.fn((height: number) => {
    map.height = height;
    article.height = height + overhead;
  });
  const controller = new PageHeightController(
    host as unknown as HTMLElement,
    article as unknown as HTMLElement,
    map as unknown as HTMLElement,
    apply,
  );
  map.width = 0;
  flush();
  expect(apply).not.toHaveBeenCalled();
  map.width = 500;
  controller.schedule();
  win.dispatchEvent(new Event('resize'));
  expect(frames.size).toBe(1);
  flush();
  expect(apply).toHaveBeenLastCalledWith(802);
  observers[0].callback();
  flush();
  expect(apply).toHaveBeenCalledTimes(1);
  win.scrollY = 50;
  article.top = 30;
  doc.dispatchEvent(new Event('scroll'));
  flush();
  expect(apply).toHaveBeenCalledTimes(1);
  viewport.height = 900;
  viewport.dispatchEvent(new Event('resize'));
  flush();
  expect(apply).toHaveBeenLastCalledWith(702);
  overhead += 100;
  article.height += 100;
  observers[0].callback();
  flush();
  expect(apply).toHaveBeenLastCalledWith(602);
  shadow.dispatchEvent(new Event('scroll'));
  expect(frames.size).toBe(1);
  controller.schedule();
  controller.disconnect();
  expect(frames.size).toBe(0);
  win.dispatchEvent(new Event('resize'));
  doc.dispatchEvent(new Event('scroll'));
  viewport.dispatchEvent(new Event('resize'));
  observers[0].callback();
  shadow.dispatchEvent(new Event('scroll'));
  expect(frames.size).toBe(0);
  for (const observer of observers)
    expect(observer.disconnect).toHaveBeenCalled();
});

it('honors explicit scrollport bounds without using an auto-growing ancestor height', () => {
  const card = new FakeElement(),
    scroller = new FakeElement(),
    container = new FakeElement();
  card.parentElement = scroller;
  scroller.parentElement = container;
  scroller.top = 116;
  container.top = 116;
  let constraint = 'none';
  let typedHeight = 'auto';
  Object.assign(container, {
    computedStyleMap: () => ({ get: () => ({ toString: () => typedHeight }) }),
  });
  vi.stubGlobal('ShadowRoot', FakeShadowRoot);
  vi.stubGlobal('window', { scrollY: 0 });
  vi.stubGlobal('document', { scrollingElement: null });
  vi.stubGlobal('getComputedStyle', (element: FakeElement) => ({
    overflowY: element === scroller ? 'auto' : 'visible',
    maxHeight: element === container ? constraint : 'none',
    height: `${element.height}px`,
    boxSizing: 'content-box',
    borderTopWidth: '0px',
    borderBottomWidth: '0px',
    paddingTop: '0px',
    paddingBottom: '0px',
  }));
  // Auto overflow containers remain free to grow. Used pixels do not prove a bound.
  expect(pageBottom(card as unknown as Element, 900)).toBe(900);
  container.height = 700;
  expect(pageBottom(card as unknown as Element, 900)).toBe(900);
  constraint = '691px';
  expect(pageBottom(card as unknown as Element, 900)).toBe(807);
  // Shrinking the content after applying the gap must not shrink the next target.
  container.height = 675;
  scroller.height = 675;
  expect(pageBottom(card as unknown as Element, 900)).toBe(807);
  scroller.scrollTop = 80;
  card.top -= 80;
  expect(pageBottom(card as unknown as Element, 900)).toBe(807);
  constraint = 'none';
  typedHeight = '500px';
  expect(pageBottom(card as unknown as Element, 900)).toBe(616);
  typedHeight = '100%';
  expect(pageBottom(card as unknown as Element, 900)).toBe(900);
});
