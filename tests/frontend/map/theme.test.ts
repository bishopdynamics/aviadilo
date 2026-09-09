import { describe, expect, it } from 'vitest';
import { resolveTheme } from '../../../src/map/theme';
describe('local map theme', () => {
  it('explicit themes override HA and OS', () => {
    expect(resolveTheme('light', { themes: { darkMode: true } }, true)).toBe(
      'light',
    );
    expect(resolveTheme('dark', { themes: { darkMode: false } }, false)).toBe(
      'dark',
    );
  });
  it('auto prioritizes explicit HA light/dark, falling back only when absent', () => {
    expect(resolveTheme('auto', { themes: { darkMode: false } }, true)).toBe(
      'light',
    );
    expect(resolveTheme('auto', { themes: { darkMode: true } }, false)).toBe(
      'dark',
    );
    expect(resolveTheme('auto', { themes: {} }, true)).toBe('dark');
    expect(resolveTheme(undefined, undefined, false)).toBe('light');
  });
});
