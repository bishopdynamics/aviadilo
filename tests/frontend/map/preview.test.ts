import { expect, it } from 'vitest';
import { previewEvents, previewHass } from '../../../src/map/preview';
import { parseEvent } from '../../../src/data/client';
it('bundled picker weather/aircraft are valid synthetic current snapshots for every radar source', () => {
  for (const provider of ['rainviewer', 'noaa_mrms', 'noaa_ksox'] as const) {
    const events = previewEvents(provider, Date.parse('2026-09-07T12:00:00Z'));
    expect(events.map((event) => parseEvent(event).kind)).toEqual([
      'aircraft',
      'radar-manifest',
      'wind-grid',
      'status',
    ]);
    const aircraft = events[0];
    if (aircraft.kind !== 'aircraft')
      throw new Error('Aircraft fixture missing');
    expect(aircraft.aircraft[0].altitude_m).toBe(0);
    expect(aircraft.aircraft[2].course_deg).toBeNull();
  }
  expect(
    previewHass(true).states['device_tracker.traveller'].attributes.longitude,
  ).toBe(139.76);
});
