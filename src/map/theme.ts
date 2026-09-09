import type { CardConfig } from '../config/types';
import type { HomeAssistant } from './geo';

/** HA's explicit false is light, not missing information. No assets or map I/O. */
export function resolveTheme(
  theme: NonNullable<CardConfig['map']>['theme'],
  hass: Pick<HomeAssistant, 'themes'> | undefined,
  osDark: boolean,
): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  const haDark = hass?.themes?.darkMode;
  return (typeof haDark === 'boolean' ? haDark : osDark) ? 'dark' : 'light';
}
