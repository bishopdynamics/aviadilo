const labels: Record<string, string> = {
  entry_id: 'Integration entry ID (optional)',
  height_px: 'Map height (px)',
  auto_height: 'Auto-size height to page',
  show_layer_buttons: 'Show layer buttons',
  show_you_are_here: 'Show “You are here” marker',
  follow_theme: 'Follow Home Assistant theme',
  extent_m: 'Initial view width',
  extent_unit: 'View distance unit',
  mode: 'Mode',
  group_overlapping: 'Group overlapping markers',
  min_zoom: 'Minimum zoom',
  max_zoom: 'Maximum zoom',
  idle_return_s: 'Idle return (seconds; blank disables)',
  include_zones: 'Zones included in automatic fit',
  radius_m: 'People radius',
  radius_unit: 'People distance unit',
  max_age_s: 'Maximum update age (seconds; blank disables)',
  min_altitude_m: 'Minimum altitude (blank disables)',
  max_altitude_m: 'Maximum altitude (blank disables)',
  max_distance_m: 'Maximum distance (blank disables)',
  marker_spacing_px: 'Marker spacing (px)',
  marker_size_px: 'Marker size (px)',
  frame_duration_ms: 'Frame duration (ms)',
  selected_trail_s: 'Selected aircraft trail (seconds)',
  max_position_age_s: 'Maximum position age (seconds)',
  stale_retention_s: 'Stale retention (seconds)',
  show_stale: 'Show stale or unavailable people and trackers',
  show_photo: 'Show entity photo',
  animation_speed: 'Animation speed',
  trail_length_s: 'Particle trail (seconds)',
  history_minutes: 'History (minutes)',
  show_recenter: 'Show recenter button',
  anchor: 'Anchor',
  schema_version: 'Schema version',
  type: 'Card type',
  types: 'Aircraft types',
};
export function label(key: string): string {
  return (
    labels[key] ??
    key.replaceAll('_', ' ').replace(/^./, (x) => x.toUpperCase())
  );
}
