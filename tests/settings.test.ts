import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, getSettings } from '../utils/settings';

describe('settings storage', () => {
  beforeEach(async () => {
    await fakeBrowser.storage.local.clear();
  });

  it('falls back to defaults when a stored field is invalid', async () => {
    await fakeBrowser.storage.local.set({
      settings: { theme: 'neon', importWindowDays: 30 },
    });

    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges valid partial settings over the defaults', async () => {
    await fakeBrowser.storage.local.set({
      settings: { theme: 'dark', weekStartsOn: 1 },
    });

    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      weekStartsOn: 1,
    });
  });
});
