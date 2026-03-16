jest.mock('electron-store', () =>
  jest.fn().mockImplementation(() => ({
    store: {},
    set: jest.fn(),
    get: jest.fn(),
  })),
);

import {
  DEFAULT_THEME_ID,
  normalizeSettings,
  normalizeThemeId,
} from './settingsManager';

describe('settingsManager theme normalization', () => {
  it('defaults invalid theme ids to studio-neutral', () => {
    expect(normalizeThemeId('nordic-night')).toBe(DEFAULT_THEME_ID);
    expect(normalizeThemeId(undefined)).toBe(DEFAULT_THEME_ID);
  });

  it('preserves a valid theme and migrates missing theme ids', () => {
    expect(
      normalizeSettings({
        comfyuiMode: 'inherit',
        comfyuiUrl: '',
        comfyuiTimeout: 1800,
        themeId: 'deep-forest-gold',
      }).themeId,
    ).toBe('deep-forest-gold');

    expect(
      normalizeSettings({
        comfyuiMode: 'inherit',
        comfyuiUrl: '',
        comfyuiTimeout: 1800,
        themeId: 'void-cut',
      }).themeId,
    ).toBe('void-cut');

    expect(
      normalizeSettings({
        comfyuiMode: 'inherit',
        comfyuiUrl: '',
        comfyuiTimeout: 1800,
      }).themeId,
    ).toBe(DEFAULT_THEME_ID);
  });
});
