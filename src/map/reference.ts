import * as L from 'leaflet';
import type { Anchor, HomeAssistant, Point } from './geo';
import { visibleLongitude } from './geo';

function sourceName(anchor: Anchor, hass?: HomeAssistant): string {
  if (anchor.kind === 'home') return 'Home Assistant home';
  if (anchor.kind === 'custom') return 'configured map anchor';
  const name = hass?.states[anchor.entity_id]?.attributes.friendly_name;
  return typeof name === 'string' && name.trim()
    ? `configured map anchor: ${name.trim()}`
    : `configured map anchor: ${anchor.entity_id}`;
}

export function referenceName(anchor: Anchor, hass?: HomeAssistant): string {
  return `You are here — ${sourceName(anchor, hass)}`;
}

function icon(): HTMLElement {
  const root = document.createElement('span');
  root.className = 'reference-marker';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2.3" fill="currentColor" stroke="none"/></svg>';
  return root;
}

/** One map-reference marker. It is deliberately excluded from viewport fitting. */
export class ReferenceLayer {
  private marker?: L.Marker;
  private host?: HTMLElement;
  private signature = '';
  private point?: Point;

  constructor(private map: L.Map) {}

  update(point: Point | null, anchor: Anchor, hass?: HomeAssistant): void {
    if (!point || this.map.getZoom() === undefined) {
      this.clear();
      return;
    }
    const longitude = visibleLongitude(
      point.longitude,
      this.map.getCenter().lng,
    );
    this.point = { latitude: point.latitude, longitude };
    const name = referenceName(anchor, hass);
    const signature = JSON.stringify([point.latitude, longitude, name]);
    if (signature === this.signature) return;
    this.signature = signature;
    if (!this.marker) {
      this.marker = L.marker([point.latitude, longitude], {
        pane: 'context',
        icon: L.divIcon({
          html: icon(),
          className: 'reference-icon',
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        }),
        title: name,
        alt: name,
        keyboard: true,
        autoPanOnFocus: false,
      }).addTo(this.map);
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = 'You are here';
      const source = document.createElement('p');
      source.textContent = sourceName(anchor, hass);
      details.append(title, source);
      this.marker.bindPopup(details, { autoPan: false });
      const element = this.marker.getElement();
      element?.setAttribute('aria-label', name);
      if (element) element.dataset.memberId = 'reference';
      const activate = () => {
        const details = this.marker?.getPopup()?.getContent();
        if (this.host && details instanceof HTMLElement) {
          this.marker?.closePopup();
          if (details.parentElement === this.host) details.remove();
          else {
            details.classList.add('household-member-details');
            this.host.append(details);
          }
        } else {
          if (details instanceof HTMLElement)
            details.classList.remove('household-member-details');
          this.marker?.openPopup();
        }
      };
      element?.addEventListener('click', (event) => {
        event.stopPropagation();
        activate();
      });
      element?.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          activate();
        }
      });
      return;
    }
    this.marker.setLatLng([point.latitude, longitude]);
    this.marker.options.title = name;
    this.marker.options.alt = name;
    const element = this.marker.getElement();
    element?.setAttribute('title', name);
    element?.setAttribute('aria-label', name);
    const popup = this.marker.getPopup()?.getContent();
    if (popup instanceof HTMLElement) {
      const source = popup.querySelector('p');
      if (source) source.textContent = sourceName(anchor, hass);
    }
  }

  present(point?: Point, host?: HTMLElement): void {
    if (!this.marker || !this.point) return;
    if (this.host !== host) {
      const details = this.marker.getPopup()?.getContent();
      if (details instanceof HTMLElement && details.parentElement === this.host)
        details.remove();
    }
    this.host = host;
    const position = point ?? this.point;
    this.marker.setLatLng([position.latitude, position.longitude]);
    const element = this.marker.getElement();
    if (element) {
      const target = host ?? this.map.getPane('context')!;
      if (element.parentElement !== target) target.append(element);
      element.classList.toggle('household-grid-icon', !!host);
    }
  }

  clear(): void {
    const details = this.marker?.getPopup()?.getContent();
    if (details instanceof HTMLElement) details.remove();
    this.signature = '';
    this.marker?.remove();
    this.marker = undefined;
  }

  dispose(): void {
    this.clear();
  }
}
