const LIGHT_HEAT = {
  empty: '#f2f2f2',
  from: [224, 230, 180],
  to: [190, 174, 50],
} as const;

const DARK_HEAT = {
  empty: '#313131',
  from: [89, 86, 38],
  to: [116, 101, 39],
} as const;

export function getHeatColor(views: number, maxViews: number, theme: 'light' | 'dark'): string {
  const palette = theme === 'dark' ? DARK_HEAT : LIGHT_HEAT;
  if (views <= 0) return palette.empty;

  const ratio = maxViews > 0 ? Math.min(1, views / maxViews) : 0;
  const color = palette.from.map((channel, index) =>
    Math.round(channel + ((palette.to[index] ?? channel) - channel) * ratio),
  );

  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}
