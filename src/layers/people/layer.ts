import * as L from 'leaflet';
import {
  type HomeAssistant,
  type Point,
  visibleLongitude,
} from '../../map/geo';
import {
  AssetFailure,
  pictureKey,
  type DecodedAssets,
  type DecodedAsset,
} from '../../data/assets';
import type { PeopleConfig, PersonPoint } from './model';
/** DOM APIs keep user-controlled entity names out of HTML interpolation. */
class PersonLayer {
  private marker?: L.Marker;
  private host?: HTMLElement;
  private circle?: L.Circle;
  private status?: HTMLElement;
  private lastPerson?: PersonPoint;
  private lastConfig?: PeopleConfig;
  private label?: HTMLElement;
  private icon?: HTMLElement;
  private group = L.layerGroup();
  private signature = '';
  private assets?: DecodedAssets;
  private entryId?: string;
  private currentHass?: () => HomeAssistant | undefined;
  private cleanups: (() => void)[] = [];
  private unobserve?: () => void;
  private uncapacity?: () => void;
  private blocked = false;
  setAssets(
    assets?: DecodedAssets,
    entryId?: string,
    currentHass?: () => HomeAssistant | undefined,
  ): void {
    if (this.assets === assets && this.entryId === entryId) return;
    this.clear();
    this.unobserve?.();
    this.uncapacity?.();
    this.assets = assets;
    this.entryId = entryId;
    this.currentHass = currentHass;
    this.unobserve = assets?.client.observe(() => this.clear());
    this.uncapacity = assets?.observeCapacity(() => {
      if (this.blocked) {
        this.blocked = false;
        this.signature = '';
      }
    });
  }
  private clear(): void {
    this.signature = '';
    const details = this.marker?.getPopup()?.getContent();
    if (details instanceof HTMLElement) details.remove();
    this.cleanups.splice(0).forEach((stop) => stop());
    this.group.clearLayers();
    this.marker = undefined;
    this.circle = undefined;
  }
  constructor(private map: L.Map) {
    this.group.addTo(map);
  }
  update(
    points: PersonPoint[],
    config: PeopleConfig,
    presented?: boolean,
  ): void {
    if (this.map.getZoom() === undefined) {
      this.clear();
      return;
    }
    const centerLongitude =
      this.map.getZoom() === undefined ? 0 : this.map.getCenter().lng;
    points = points.map((person) => ({
      ...person,
      longitude: visibleLongitude(person.longitude, centerLongitude),
    }));
    this.lastPerson = points[0];
    this.lastConfig = config;
    const person = points[0];
    const photoVisible =
      presented ??
      (!!person &&
        this.map.getBounds().contains([person.latitude, person.longitude]));
    const signature = JSON.stringify([
      person && [
        person.entityId,
        person.name,
        person.icon,
        person.color,
        person.photo,
      ],
      photoVisible,
    ]);
    this.updateDetails();
    if (signature === this.signature) return;
    this.clear();
    this.signature = signature;
    for (const person of points) {
      const icon = document.createElement('span');
      this.icon = icon;
      icon.className = `person-marker${person.stale ? ' stale' : ''}`;
      icon.style.backgroundColor = person.color;
      icon.textContent = person.name.slice(0, 2).toUpperCase();
      const reason = document.createElement('p');
      if (person.photo && photoVisible) {
        const kind = photoKind(person.photo);
        const controller = new AbortController();
        let held: DecodedAsset | undefined;
        const img = document.createElement('img');
        img.alt = '';
        const clear = () => {
          if (held) held.signal.removeEventListener('abort', clear);
          img.onload = null;
          img.onerror = null;
          img.removeAttribute('src');
          img.remove();
          icon.textContent = person.name.slice(0, 2).toUpperCase();
          held?.release();
          held = undefined;
        };
        this.cleanups.push(() => {
          controller.abort();
          clear();
        });
        const failure = (message: string) => {
          clear();
          reason.textContent = message;
        };
        img.onerror = () => failure('Entity picture unavailable');
        if (kind === 'first-party') {
          img.src = person.photo;
          icon.replaceChildren(img);
        } else if (kind === 'external' && this.assets) {
          const key = pictureKey(person.photo);
          const valid = () => {
            const picture =
              this.currentHass?.()?.states[person.entityId]?.attributes
                .entity_picture;
            return typeof picture === 'string' && pictureKey(picture) === key;
          };
          void this.assets
            .acquire(
              {
                kind: 'photo',
                entity_id: person.entityId,
                picture_key: key,
                ...(this.entryId ? { entry_id: this.entryId } : {}),
              },
              controller.signal,
              valid,
            )
            .then((asset) => {
              held = asset;
              if (!asset.current() || controller.signal.aborted) {
                clear();
                return;
              }
              asset.signal.addEventListener('abort', clear, { once: true });
              img.src = asset.url;
              icon.replaceChildren(img);
            })
            .catch((error: unknown) => {
              if (error instanceof AssetFailure && error.localCapacity)
                this.blocked = true;
              if (!controller.signal.aborted)
                failure(
                  error instanceof AssetFailure
                    ? error.message
                    : 'Entity picture unavailable',
                );
            });
        } else
          reason.textContent =
            kind === 'unsupported'
              ? 'Entity picture address is unsupported'
              : 'Entity picture service unavailable';
      } else if (
        !person.photo &&
        person.icon &&
        customElements.get('ha-icon')
      ) {
        const haIcon = document.createElement('ha-icon');
        haIcon.setAttribute('icon', person.icon);
        icon.replaceChildren(haIcon);
      }
      const marker = L.marker([person.latitude, person.longitude], {
        pane: 'people',
        icon: L.divIcon({
          html: icon,
          className: 'person-icon',
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        }),
        title: person.name,
        alt: person.name,
        keyboard: true,
        autoPanOnFocus: false,
      }).addTo(this.group);
      this.marker = marker;
      const element = marker.getElement();
      element?.setAttribute('aria-label', person.name);
      if (element) element.dataset.memberId = person.entityId;
      const activate = () => {
        const details = marker.getPopup()?.getContent();
        if (this.host && details instanceof HTMLElement) {
          marker.closePopup();
          if (details.parentElement === this.host) details.remove();
          else {
            details.classList.add('household-member-details');
            this.host.append(details);
          }
        } else {
          if (details instanceof HTMLElement)
            details.classList.remove('household-member-details');
          marker.openPopup();
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
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = person.name;
      details.append(title);
      const status = document.createElement('p');
      this.status = status;
      details.append(status, reason);
      marker.bindPopup(details, { autoPan: false });
      this.updateDetails();
    }
  }
  private updateDetails(): void {
    const person = this.lastPerson,
      config = this.lastConfig;
    if (!person || !config || !this.marker) return;
    if (this.status)
      this.status.textContent = `${person.stale ? 'Stale / unavailable · ' : ''}${person.timestampKind === 'unknown' ? 'Position freshness unknown' : `${person.timestampKind === 'position' ? 'Position time' : 'Entity updated (GPS age unknown)'}: ${new Date(person.timestamp!).toLocaleString()}`}`;
    this.icon?.classList.toggle('stale', person.stale);
    if (config.accuracy_circles && person.accuracyM !== null) {
      if (!this.circle)
        this.circle = L.circle([person.latitude, person.longitude], {
          radius: person.accuracyM,
          color: person.color,
          weight: 1,
          fillOpacity: 0.08,
          interactive: false,
          pane: 'context',
          className: 'person-accuracy',
        }).addTo(this.group);
      this.circle.setLatLng([person.latitude, person.longitude]);
      this.circle.setRadius(person.accuracyM);
    } else {
      this.circle?.remove();
      this.circle = undefined;
    }
    const popup = this.marker.getPopup()?.getContent();
    if (popup instanceof HTMLElement) {
      let location = popup.querySelector('.person-location');
      if (person.locationKind === 'zone') {
        if (!location) {
          location = document.createElement('p');
          location.className = 'person-location';
          popup.append(location);
        }
        location.textContent = `Zone location: ${person.zoneName ?? person.zoneId} · GPS age unknown`;
      } else location?.remove();
    }
  }
  present(point?: Point, host?: HTMLElement): void {
    if (!this.marker || !this.lastPerson) return;
    if (this.host !== host) {
      const details = this.marker.getPopup()?.getContent();
      if (details instanceof HTMLElement && details.parentElement === this.host)
        details.remove();
    }
    this.host = host;
    const person = this.lastPerson;
    const position = point ?? person;
    this.marker.setLatLng([position.latitude, position.longitude]);
    const element = this.marker.getElement();
    if (element) {
      const target = host ?? this.map.getPane('people')!;
      if (element.parentElement !== target) target.append(element);
      element.classList.toggle('household-grid-icon', !!host);
    }
    if (this.lastConfig?.show_labels && !host) {
      if (!this.marker.getTooltip()) {
        this.label = document.createElement('span');
        this.label.textContent = person.name;
        this.marker.bindTooltip(this.label, {
          permanent: true,
          direction: 'bottom',
          offset: [0, 18],
          className: 'person-label',
        });
      }
    } else this.marker.unbindTooltip();
  }
  dispose(): void {
    this.unobserve?.();
    this.uncapacity?.();
    this.clear();
    this.group.remove();
  }
}
/** Stable per-entity adapters keep images, open popups and focus through layout updates. */
export class PeopleLayer {
  private entries = new Map<string, PersonLayer>();
  private assets?: DecodedAssets;
  private entryId?: string;
  private currentHass?: () => HomeAssistant | undefined;
  constructor(private map: L.Map) {}
  setAssets(
    assets?: DecodedAssets,
    entryId?: string,
    currentHass?: () => HomeAssistant | undefined,
  ): void {
    this.assets = assets;
    this.entryId = entryId;
    this.currentHass = currentHass;
    for (const layer of this.entries.values())
      layer.setAssets(assets, entryId, currentHass);
  }
  update(
    points: PersonPoint[],
    config: PeopleConfig,
    placements?: Map<string, { point?: Point; host?: HTMLElement }>,
  ): void {
    const wanted = new Set(points.map((p) => p.entityId));
    for (const [id, layer] of this.entries)
      if (!wanted.has(id)) {
        layer.dispose();
        this.entries.delete(id);
      }
    for (const point of points) {
      let layer = this.entries.get(point.entityId);
      if (!layer) {
        layer = new PersonLayer(this.map);
        layer.setAssets(this.assets, this.entryId, this.currentHass);
        this.entries.set(point.entityId, layer);
      }
      layer.update(
        [point],
        config,
        placements?.has(point.entityId) ? true : undefined,
      );
      const placement = placements?.get(point.entityId);
      layer.present(placement?.point, placement?.host);
    }
  }
  dispose(): void {
    for (const layer of this.entries.values()) layer.dispose();
    this.entries.clear();
  }
}
/** Same-origin/relative HA pictures remain first-party; every external URL goes
 * through the authorized entity route. Never expose the raw external URL. */
export function photoKind(
  value: string,
  origin = location.origin,
): 'first-party' | 'external' | 'unsupported' {
  if (!value || /[\\\s]/.test(value) || value.startsWith('//'))
    return 'unsupported';
  try {
    const url = new URL(value, origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      return 'unsupported';
    if (url.origin === origin) return 'first-party';
    return url.protocol === 'https:' ? 'external' : 'unsupported';
  } catch {
    return 'unsupported';
  }
}
