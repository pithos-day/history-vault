import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  getSettings,
  type Settings,
  saveSettings,
  subscribeSettings,
} from '@/utils/settings';

export function useSettings(): {
  settings: Settings;
  loaded: boolean;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void getSettings().then((value) => {
      if (!active) return;
      setSettings(value);
      setLoaded(true);
    });
    const unsubscribe = subscribeSettings(setSettings);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, loaded, updateSettings };
}
