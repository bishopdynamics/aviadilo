import * as L from 'leaflet';
import { type HomeAssistant, visibleLongitude } from '../../map/geo';
import {
  AssetFailure,
  pictureKey,
  type DecodedAssets,
  type DecodedAsset,
} from '../../data/assets';
import type { PeopleConfig, PersonPoint } from './model';
/** DOM APIs keep user-controlled entity names out of HTML interpolation. */
export class PeopleLayer {
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
    this.cleanups.splice(0).forEach((stop) => stop());
    this.group.clearLayers();
  }
  constructor(private map: L.Map) {
    this.group.addTo(map);
  }
  update(points: PersonPoint[], config: PeopleConfig): void {
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
    const signature = JSON.stringify([
      points,
      config.show_labels,
      config.accuracy_circles,
      this.map.getBounds().toBBoxString(),
    ]);
    if (signature === this.signature) return;
    this.clear();
    this.signature = signature;
    for (const person of points) {
      if (config.accuracy_circles && person.accuracyM !== null)
        L.circle([person.latitude, person.longitude], {
          radius: person.accuracyM,
          color: person.color,
          weight: 1,
          fillOpacity: 0.08,
          interactive: false,
          pane: 'context',
        }).addTo(this.group);
      const icon = document.createElement('span');
      icon.className = `person-marker${person.stale ? ' stale' : ''}`;
      icon.style.backgroundColor = person.color;
      icon.textContent = person.name.slice(0, 2).toUpperCase();
      const reason = document.createElement('p');
      if (
        person.photo &&
        this.map.getBounds().contains([person.latitude, person.longitude])
      ) {
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
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
        title: person.name,
        alt: person.name,
        keyboard: true,
        autoPanOnFocus: false,
      }).addTo(this.group);
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = person.name;
      details.append(title);
      if (person.locationKind === 'zone') {
        const location = document.createElement('p');
        location.textContent = `Zone location: ${person.zoneName ?? person.zoneId} · GPS age unknown`;
        details.append(location);
      }
      const status = document.createElement('p');
      status.textContent = `${person.stale ? 'Stale / unavailable · ' : ''}${person.timestampKind === 'unknown' ? 'Position freshness unknown' : `${person.timestampKind === 'position' ? 'Position time' : 'Entity updated (GPS age unknown)'}: ${new Date(person.timestamp!).toLocaleString()}`}`;
      details.append(status, reason);
      marker.bindPopup(details, { autoPan: false });
      if (config.show_labels) {
        const label = document.createElement('span');
        label.textContent = person.name;
        marker.bindTooltip(label, {
          permanent: true,
          direction: 'bottom',
          offset: [0, 16],
        });
      }
    }
  }
  dispose(): void {
    this.unobserve?.();
    this.uncapacity?.();
    this.clear();
    this.group.remove();
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
