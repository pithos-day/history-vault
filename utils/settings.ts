import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';
import { isOneOf } from './validation';

export type ThemeSetting = 'system' | 'light' | 'dark';
type WeekStart = 0 | 1;

export interface Settings {
  mirrorBrowserDeletes: boolean;
  theme: ThemeSetting;
  weekStartsOn: WeekStart;
  importWindowDays: 90 | 365 | 0;
  onboardingDone: boolean;
}

const SETTINGS_KEY = 'settings';
const THEMES = ['system', 'light', 'dark'] as const;
const IMPORT_WINDOWS = [90, 365, 0] as const;

export const DEFAULT_SETTINGS: Settings = {
  mirrorBrowserDeletes: false,
  theme: 'system',
  weekStartsOn: 0,
  importWindowDays: 90,
  onboardingDone: false,
};

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY];
  if (!isSettings(stored)) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function ensureDefaultSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  if (isSettings(result[SETTINGS_KEY])) return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
  await browser.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

export function subscribeSettings(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') return;
    const change = changes[SETTINGS_KEY];
    if (isSettings(change?.newValue)) listener({ ...DEFAULT_SETTINGS, ...change.newValue });
  };

  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

function isSettings(value: unknown): value is Partial<Settings> {
  if (typeof value !== 'object' || value === null) return false;

  const settings = value as Partial<Record<keyof Settings, unknown>>;
  return (
    (settings.mirrorBrowserDeletes === undefined ||
      typeof settings.mirrorBrowserDeletes === 'boolean') &&
    (settings.theme === undefined || isOneOf(settings.theme, THEMES)) &&
    (settings.weekStartsOn === undefined ||
      settings.weekStartsOn === 0 ||
      settings.weekStartsOn === 1) &&
    (settings.importWindowDays === undefined ||
      isOneOf(settings.importWindowDays, IMPORT_WINDOWS)) &&
    (settings.onboardingDone === undefined || typeof settings.onboardingDone === 'boolean')
  );
}
