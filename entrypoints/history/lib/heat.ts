export function getHeatColor(views: number, maxViews: number, theme: 'light' | 'dark'): string {
  if (views <= 0) return 'transparent';

  const ratio = maxViews > 0 ? Math.min(1, views / maxViews) : 0;

  if (theme === 'dark') {
    return `rgba(242, 165, 65, ${0.12 + ratio * 0.48})`;
  }

  const from = [255, 253, 231];
  const to = [255, 204, 128];
  const color = from.map((channel, index) =>
    Math.round(channel + ((to[index] ?? channel) - channel) * ratio),
  );

  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}
