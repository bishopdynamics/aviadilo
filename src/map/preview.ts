import type { HomeAssistant } from './geo';
export function previewHass(tokyo = false): HomeAssistant {
  const last_updated = new Date().toISOString();
  return {
    config: { latitude: 34.1, longitude: -117.72 },
    states: {
      'zone.home': {
        state: '0',
        attributes: {
          latitude: 34.1,
          longitude: -117.72,
          friendly_name: 'Synthetic home',
        },
      },
      'device_tracker.synthetic': {
        state: 'home',
        last_updated,
        attributes: {
          latitude: 34.11,
          longitude: -117.7,
          friendly_name: 'Alex · synthetic',
          gps_accuracy: 150,
        },
      },
      'device_tracker.traveller': {
        state: 'not_home',
        last_updated,
        attributes: {
          latitude: tokyo ? 35.68 : 34.16,
          longitude: tokyo ? 139.76 : -117.68,
          friendly_name: 'Sam · synthetic',
          gps_accuracy: 500,
        },
      },
    },
  };
}
