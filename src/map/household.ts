import * as L from 'leaflet';
import type { PeopleConfig, PersonPoint } from '../layers/people/model';
import type { PeopleLayer } from '../layers/people/layer';
import { ReferenceLayer, referenceName } from './reference';
import {
  visibleLongitude,
  type Point,
  type Anchor,
  type HomeAssistant,
} from './geo';
import {
  LABEL_HEIGHT,
  LABEL_WIDTH,
  originalSingletonIds,
  overlapGroups,
  spreadMembers,
  visibleMembers,
  type ScreenMember,
  type HouseholdGroup,
} from './household-layout';

interface Input {
  people: PersonPoint[];
  config: PeopleConfig;
  reference: Point | null;
  anchor: Anchor;
  hass?: HomeAssistant;
}
/** One coordinator owns presentation of both ends; it never calls fit/pan or clients. */
export class HouseholdLayer {
  private input?: Input;
  private signature = '';
  private expanded?: string;
  private groups = new Map<
    string,
    { marker: L.Marker; button: HTMLButtonElement }
  >();
  private connectors = L.layerGroup();
  private panel?: HTMLElement;
  private slots = new Map<string, HTMLElement>();
  private readonly background = () => this.collapse(false);
  private readonly keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.expanded) {
      event.preventDefault();
      event.stopPropagation();
      this.collapse(true);
    }
  };
  constructor(
    private map: L.Map,
    private people: PeopleLayer,
    private reference: ReferenceLayer,
  ) {
    this.connectors.addTo(map);
    map.on('click', this.background);
    map.getContainer().addEventListener('keydown', this.keydown);
  }
  update(
    people: PersonPoint[],
    config: PeopleConfig,
    reference: Point | null,
    anchor: Anchor,
    hass?: HomeAssistant,
  ): void {
    this.input = { people, config, reference, anchor, hass };
    this.render();
  }
  private collapse(focus: boolean): void {
    const id = this.expanded;
    if (!id) return;
    this.expanded = undefined;
    this.render();
    if (focus) this.groups.get(id)?.button.focus({ preventScroll: true });
  }
  private project(id: string, point: Point, labels: boolean): ScreenMember {
    const screen = this.map.latLngToContainerPoint([
      point.latitude,
      visibleLongitude(point.longitude, this.map.getCenter().lng),
    ]);
    return {
      id,
      x: screen.x,
      y: screen.y,
      width: labels ? LABEL_WIDTH : 52,
      height: labels ? LABEL_HEIGHT : 52,
    };
  }
  private point(p: { x: number; y: number }): Point {
    const position = this.map.containerPointToLatLng([p.x, p.y]);
    return { latitude: position.lat, longitude: position.lng };
  }
  private render(): void {
    if (!this.input) return;
    const { people, config, reference, anchor, hass } = this.input;
    // append/remove during overflow transitions can clear shadow-root focus.
    // Capture before removing the old panel so every retained control, including
    // an individual/reference marker, can regain focus after reparenting.
    const container = this.map.getContainer();
    const root = container.getRootNode() as Document | ShadowRoot;
    const focused =
      root.activeElement instanceof HTMLElement &&
      container.contains(root.activeElement)
        ? root.activeElement
        : undefined;
    if (this.map.getZoom() === undefined) {
      this.people.update([], config);
      this.reference.clear();
      this.clearPresentation();
      return;
    }
    const size = this.map.getSize();
    const members = visibleMembers(
      [
        ...people.map((p) => this.project(p.entityId, p, !!config.show_labels)),
        ...(reference ? [this.project('reference', reference, false)] : []),
      ],
      size.x,
      size.y,
    );
    const signature = JSON.stringify([
      members,
      size,
      !!config.group_overlapping,
    ]);
    const changed = signature !== this.signature;
    if (changed) this.expanded = undefined;
    this.signature = signature;
    const clusters = config.group_overlapping
      ? overlapGroups(members, size.x, size.y).filter(
          (group) => group.members.length > 1,
        )
      : [];
    const grouped = new Set(
      clusters
        .filter((group) => group.id !== this.expanded)
        .flatMap((group) => group.members),
    );
    const individuals = members.filter((member) => !grouped.has(member.id));
    const glyphs = clusters.map((group) => ({
      id: `group:${group.id}`,
      x: group.x,
      y: group.y,
      width: 56,
      height: 56,
    }));
    const layout = spreadMembers(
      [...individuals, ...glyphs],
      size.x,
      size.y,
      originalSingletonIds(members),
    );
    const positions = new Map(
      layout.positions.map((position) => [position.id, position]),
    );
    const names = new Map(people.map((p) => [p.entityId, p.name]));
    if (reference) names.set('reference', referenceName(anchor, hass));
    // If even collapsed controls cannot fit, the same bounded panel holds them.
    const panelIds = layout.fallback
      ? [...glyphs.map((p) => p.id), ...individuals.map((p) => p.id)]
      : [];
    this.syncPanel(panelIds, names, clusters);
    const activeGroups = new Set(clusters.map((group) => group.id));
    for (const [id, group] of this.groups)
      if (!activeGroups.has(id)) {
        group.marker.remove();
        this.groups.delete(id);
      }
    for (const cluster of clusters)
      this.presentGroup(
        cluster,
        positions.get(`group:${cluster.id}`) ?? cluster,
        names,
      );
    const placements = new Map<string, { point?: Point; host?: HTMLElement }>();
    this.connectors.clearLayers();
    const endpoints: L.LatLng[][] = [];
    for (const member of individuals) {
      const display = positions.get(member.id);
      const host = this.slots.get(member.id);
      placements.set(member.id, {
        point: display ? this.point(display) : this.point(member),
        host,
      });
      if (display && Math.hypot(display.x - member.x, display.y - member.y) > 1)
        endpoints.push([
          this.map.containerPointToLatLng([member.x, member.y]),
          this.map.containerPointToLatLng([display.x, display.y]),
        ]);
    }
    // All casings precede all foregrounds so a crossing cannot erase a line.
    for (const casing of [true, false])
      for (const points of endpoints)
        L.polyline(points, {
          pane: 'context',
          color: casing ? '#ffffff' : '#102131',
          weight: casing ? 6 : 3,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: casing
            ? 'household-connector-casing'
            : 'household-connector',
        }).addTo(this.connectors);
    const visible = new Set(individuals.map((p) => p.id));
    this.people.update(
      people.filter((p) => visible.has(p.entityId)),
      config,
      placements,
    );
    this.reference.update(
      visible.has('reference') ? reference : null,
      anchor,
      hass,
    );
    const placement = placements.get('reference');
    this.reference.present(placement?.point, placement?.host);
    if (focused?.isConnected && root.activeElement !== focused) {
      focused.focus({ preventScroll: true });
      // Reveal only within the panel. scrollIntoView could also scroll the HA
      // dashboard/window, and ordinary marker focus must never move the map.
      if (this.panel?.contains(focused)) {
        const box = focused.getBoundingClientRect();
        const panelBox = this.panel.getBoundingClientRect();
        const top = panelBox.top + this.panel.clientTop;
        const bottom = top + this.panel.clientHeight;
        if (box.top < top) this.panel.scrollTop += box.top - top;
        else if (box.bottom > bottom)
          this.panel.scrollTop += box.bottom - bottom;
      }
    }
  }
  private presentGroup(
    cluster: HouseholdGroup,
    display: { x: number; y: number },
    names: Map<string, string>,
  ): void {
    let group = this.groups.get(cluster.id);
    if (!group) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'household-group';
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.disableScrollPropagation(button);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        button.focus({ preventScroll: true });
        this.expanded = this.expanded === cluster.id ? undefined : cluster.id;
        this.render();
      });
      const marker = L.marker([0, 0], {
        pane: 'people',
        keyboard: false,
        interactive: true,
        icon: L.divIcon({
          html: button,
          className: 'household-group-icon',
          iconSize: [56, 56],
          iconAnchor: [28, 28],
        }),
      }).addTo(this.map);
      group = { marker, button };
      this.groups.set(cluster.id, group);
    }
    const expanded = this.expanded === cluster.id;
    group.button.textContent = `${cluster.members.length}`;
    group.button.setAttribute('aria-expanded', String(expanded));
    const label = `${cluster.members.length} markers: ${cluster.members.map((id) => names.get(id)).join(', ')}. ${expanded ? 'Collapse' : 'Show individual markers'}`;
    group.button.setAttribute('aria-label', label);
    group.button.title = label;
    const position = this.point(display);
    group.marker.setLatLng([position.latitude, position.longitude]);
    const element = group.marker.getElement();
    const slot = this.slots.get(`group:${cluster.id}`);
    if (element) {
      const parent = slot ?? this.map.getPane('people')!;
      if (element.parentElement !== parent) parent.append(element);
      element.classList.toggle('household-grid-icon', !!slot);
    }
  }
  private syncPanel(
    ids: string[],
    names: Map<string, string>,
    clusters: HouseholdGroup[],
  ): void {
    if (!ids.length) {
      this.panel?.remove();
      this.panel = undefined;
      this.slots.clear();
      return;
    }
    if (!this.panel) {
      this.panel = document.createElement('div');
      this.panel.className = 'household-members';
      this.panel.setAttribute('role', 'region');
      this.panel.setAttribute('aria-label', 'Household markers');
      this.panel.tabIndex = 0;
      this.panel.addEventListener('keydown', (event) => {
        this.keydown(event);
        // Native scrolling still works; Leaflet must not pan the map beneath it.
        event.stopPropagation();
      });
      L.DomEvent.disableClickPropagation(this.panel);
      L.DomEvent.disableScrollPropagation(this.panel);
      this.map.getContainer().append(this.panel);
    }
    const wanted = new Set(ids);
    for (const [id, slot] of this.slots)
      if (!wanted.has(id)) {
        slot.remove();
        this.slots.delete(id);
      }
    for (const [index, id] of ids.entries()) {
      let slot = this.slots.get(id);
      if (!slot) {
        slot = document.createElement('div');
        slot.className = 'household-member';
        slot.dataset.memberId = id;
        const label = document.createElement('span');
        label.className = 'household-member-name';
        slot.append(label);
        this.panel.append(slot);
        this.slots.set(id, slot);
      }
      // Keep collapse controls before members even when reusing an existing panel.
      if (this.panel.children[index] !== slot)
        this.panel.insertBefore(slot, this.panel.children[index] ?? null);
      const group = clusters.find((group) => `group:${group.id}` === id);
      slot.querySelector('.household-member-name')!.textContent = group
        ? `${group.members.length} markers`
        : names.get(id)!;
    }
  }
  private clearPresentation(): void {
    for (const group of this.groups.values()) group.marker.remove();
    this.groups.clear();
    this.connectors.clearLayers();
    this.panel?.remove();
    this.panel = undefined;
    this.slots.clear();
    this.signature = '';
    this.expanded = undefined;
  }
  dispose(): void {
    this.map.off('click', this.background);
    this.map.getContainer().removeEventListener('keydown', this.keydown);
    this.clearPresentation();
    this.connectors.remove();
  }
}
