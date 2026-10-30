import { formatCount } from '@/utils/date';
import type { ActivityPoint } from '@/utils/history/types';

interface ActivityChartProps {
  points: ActivityPoint[];
  maxViews: number;
  label: string;
}

const WIDTH = 300;
const HEIGHT = 132;
const LEFT = 34;
const RIGHT = 8;
const TOP = 8;
const BOTTOM = 24;

export function ActivityChart({ points, maxViews, label }: ActivityChartProps) {
  if (points.length === 0) {
    return <div className="chart-empty">データがありません。</div>;
  }

  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const max = Math.max(1, maxViews);
  const baseline = TOP + plotHeight;
  const xFor = (index: number) =>
    points.length === 1 ? LEFT + plotWidth / 2 : LEFT + (index / (points.length - 1)) * plotWidth;
  const yFor = (value: number) => TOP + plotHeight - (value / max) * plotHeight;

  const viewsPath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.views)}`)
    .join(' ');
  const pagesPath = [
    `M ${xFor(0)} ${baseline}`,
    ...points.map((point, index) => `L ${xFor(index)} ${yFor(point.pages)}`),
    `L ${xFor(points.length - 1)} ${baseline}`,
    'Z',
  ].join(' ');
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg
      aria-label={`${label}の閲覧アクティビティ`}
      className="activity-chart"
      role="img"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <title>{label}</title>
      {[0, 0.5, 1].map((ratio) => {
        const y = TOP + plotHeight - ratio * plotHeight;
        return (
          <g key={ratio}>
            <line
              stroke="var(--chart-grid)"
              strokeDasharray={ratio === 0 ? undefined : '3 3'}
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y}
              y2={y}
            />
            <text fill="var(--text-muted)" fontSize="8" textAnchor="end" x={LEFT - 5} y={y + 3}>
              {formatCount(Math.round(max * ratio))}
            </text>
          </g>
        );
      })}

      <path d={pagesPath} fill="var(--chart-pages)" opacity="0.75" />
      <path d={viewsPath} fill="none" stroke="var(--chart-views)" strokeWidth="2" />

      {points.map((point, index) => {
        if (index % labelEvery !== 0 && index !== points.length - 1) return null;
        return (
          <text
            fill="var(--text-muted)"
            fontSize="8"
            key={point.start}
            textAnchor="middle"
            x={xFor(index)}
            y={HEIGHT - 7}
          >
            {point.label}
          </text>
        );
      })}

      {points.map((point, index) => (
        <circle
          cx={xFor(index)}
          cy={yFor(point.views)}
          fill="var(--chart-views)"
          key={`dot-${point.start}`}
          r="1.8"
        >
          <title>
            {point.label}: {formatCount(point.views)}閲覧 / {formatCount(point.pages)}ページ
          </title>
        </circle>
      ))}
    </svg>
  );
}
