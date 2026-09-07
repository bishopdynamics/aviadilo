import * as L from 'leaflet';
import { visibleLongitude } from '../../map/geo';
import type { PeopleConfig, PersonPoint } from './model';
/** DOM APIs keep user-controlled entity names out of HTML interpolation. */
export class PeopleLayer {
  private group = L.layerGroup();
  private signature = '';
  constructor(private map: L.Map) {
    this.group.addTo(map);
  }
  update(points: PersonPoint[], config: PeopleConfig, preview: boolean): void {
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
      preview,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.group.clearLayers();
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
      if (person.photo && !preview && safePhoto(person.photo)) {
        const img = document.createElement('img');
        img.src = person.photo;
        img.alt = '';
        img.addEventListener(
          'error',
          () => {
            img.remove();
            icon.textContent = person.name.slice(0, 2).toUpperCase();
          },
          { once: true },
        );
        icon.append(img);
      } else if (person.icon && !preview && customElements.get('ha-icon')) {
        const haIcon = document.createElement('ha-icon');
        haIcon.setAttribute('icon', person.icon);
        icon.append(haIcon);
      } else icon.textContent = person.name.slice(0, 2).toUpperCase();
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
      const status = document.createElement('p');
      status.textContent = `${person.stale ? 'Stale / unavailable · ' : ''}${person.timestampKind === 'unknown' ? 'Position freshness unknown' : `${person.timestampKind === 'position' ? 'Position time' : 'Entity updated (GPS age unknown)'}: ${new Date(person.timestamp!).toLocaleString()}`}`;
      details.append(status);
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
    this.group.remove();
    this.group.clearLayers();
  }
}
function safePhoto(value: string): boolean {
  try {
    const url = new URL(value, location.href);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}
