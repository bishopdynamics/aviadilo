/** Public composed-tree geometry shared by dashboard, editor and picker cards. */
export function composedParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Restore scrolling exactly once: the document scroller is already in scrollY.
 * A card further down the page stays the same size when scrolled into view.
 */
export function layoutTop(element: Element): number {
  let top = element.getBoundingClientRect().top + window.scrollY;
  for (
    let parent = composedParent(element);
    parent;
    parent = composedParent(parent)
  )
    if (parent !== document.scrollingElement) top += parent.scrollTop;
  return top;
}

export function remainingMapHeight(
  viewportHeight: number,
  top: number,
  nonMapHeight: number,
): number | undefined {
  if (
    ![viewportHeight, top, nonMapHeight].every(Number.isFinite) ||
    viewportHeight <= 0
  )
    return undefined;
  return Math.max(
    160,
    Math.floor(viewportHeight - top - Math.max(0, nonMapHeight) - 16),
  );
}

function pixels(value: string | undefined): number | undefined {
  return value && /^\d+(?:\.\d+)?px$/.test(value)
    ? Number.parseFloat(value)
    : undefined;
}

/** Only explicit CSS constraints can bound a scrollport. Used/computed height
 * alone is unsafe: an auto-sized parent would shrink by the bottom gap on every
 * observation. Typed OM retains `auto`, unlike getComputedStyle().height.
 * A definite max-height also bounds nested flex/grid scrollports, even when the
 * constrained ancestor itself has visible overflow.
 */
export function pageBottom(element: Element, viewportHeight: number): number {
  let bottom = viewportHeight;
  let clips = false;
  for (
    let parent = composedParent(element);
    parent;
    parent = composedParent(parent)
  ) {
    const style = getComputedStyle(parent);
    clips ||= /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (!clips) continue;
    const typed = (
      parent as Element & {
        computedStyleMap?: () => {
          get: (name: string) => { toString(): string } | undefined;
        };
      }
    ).computedStyleMap?.();
    const height = pixels(
      typed?.get('height')?.toString() ?? (parent as HTMLElement).style?.height,
    );
    const maximum = pixels(style.maxHeight);
    const limit = Math.min(height ?? Infinity, maximum ?? Infinity);
    if (!Number.isFinite(limit)) continue;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
    const padding =
      (Number.parseFloat(style.paddingTop) || 0) +
      (Number.parseFloat(style.paddingBottom) || 0);
    const innerHeight =
      style.boxSizing === 'border-box'
        ? limit - borderTop - borderBottom
        : limit + padding;
    bottom = Math.min(bottom, layoutTop(parent) + borderTop + innerHeight);
  }
  return bottom;
}

/** Observe layout causes, never use an ancestor's growing height as a target.
 * ResizeObserver also watches preceding siblings, because a card can move
 * without changing its own size. Structural changes rebuild that observation.
 */
export class PageHeightController {
  private frame?: number;
  private stopped = false;
  private readonly scrollRoots = new Set<ShadowRoot>();
  private lastHeight?: number;
  private readonly resize = new ResizeObserver(() => this.schedule());
  private readonly mutation = new MutationObserver((records) => {
    if (records.some((record) => record.type === 'childList')) this.observe();
    this.schedule();
  });
  private readonly visualViewport = window.visualViewport;

  constructor(
    private readonly host: HTMLElement,
    private readonly article: HTMLElement,
    private readonly map: HTMLElement,
    private readonly apply: (height: number) => void,
  ) {
    this.observe();
    window.addEventListener('resize', this.schedule);
    this.visualViewport?.addEventListener('resize', this.schedule);
    // Scroll triggers a measurement for sticky/layout changes, but offsets are
    // removed by layoutTop, so ordinary scrolling cannot grow the map.
    document.addEventListener('scroll', this.schedule, true);
    this.schedule();
  }

  private observe(): void {
    this.resize.disconnect();
    this.mutation.disconnect();
    for (const root of this.scrollRoots)
      root.removeEventListener('scroll', this.schedule, true);
    this.scrollRoots.clear();
    const elements = new Set<Element>([
      this.article,
      this.map,
      ...this.article.children,
    ]);
    for (
      let element: Element | null = this.host;
      element;
      element = composedParent(element)
    ) {
      elements.add(element);
      const root = element.getRootNode();
      if (root instanceof ShadowRoot && !this.scrollRoots.has(root)) {
        this.scrollRoots.add(root);
        root.addEventListener('scroll', this.schedule, true);
      }
      const parent = element.parentNode;
      if (parent) {
        this.mutation.observe(parent, { childList: true });
        if ('children' in parent)
          for (const sibling of (parent as ParentNode).children)
            elements.add(sibling);
      }
    }
    for (const element of elements) {
      this.resize.observe(element);
      // Attributes account for layout changes such as margins and visibility.
      // Do not watch map descendants: live Leaflet mutations are unrelated.
      this.mutation.observe(element, { attributes: true, childList: true });
    }
  }

  readonly schedule = (): void => {
    if (this.stopped || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      if (this.stopped || !this.host.isConnected) return;
      const article = this.article.getBoundingClientRect();
      const map = this.map.getBoundingClientRect();
      // Hidden or not yet laid out: retain the saved height until measurable.
      if (article.width <= 0 || map.width <= 0 || map.height <= 0) return;
      const height = remainingMapHeight(
        pageBottom(
          this.article,
          this.visualViewport?.height ?? window.innerHeight,
        ),
        layoutTop(this.article),
        article.height - map.height,
      );
      if (height !== undefined && height !== this.lastHeight) {
        this.lastHeight = height;
        this.apply(height);
      }
    });
  };

  disconnect(): void {
    this.stopped = true;
    for (const root of this.scrollRoots)
      root.removeEventListener('scroll', this.schedule, true);
    this.scrollRoots.clear();
    this.resize.disconnect();
    this.mutation.disconnect();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    window.removeEventListener('resize', this.schedule);
    this.visualViewport?.removeEventListener('resize', this.schedule);
    document.removeEventListener('scroll', this.schedule, true);
  }
}
