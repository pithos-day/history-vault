import { useEffect, useState } from 'react';
import type { ThemeSetting } from '@/utils/settings';

export function useResolvedTheme(setting: ThemeSetting): 'light' | 'dark' {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  const resolved = setting === 'system' ? systemTheme : setting;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [resolved]);

  return resolved;
}
