import { formatCount } from '@/utils/date';
import { formatPercent } from '@/utils/format';
import { TRANSITION_COLORS, TRANSITION_LABELS } from '@/utils/history/transitions';
import { TRANSITION_CATEGORIES, type TransitionCounts } from '@/utils/history/types';

interface TransitionDonutProps {
  transitions: TransitionCounts;
}

const SIZE = 150;
const CENTER = SIZE / 2;
const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TransitionDonut({ transitions }: TransitionDonutProps) {
  const total = TRANSITION_CATEGORIES.reduce((sum, category) => sum + transitions[category], 0);

  if (total === 0) {
    return <div className="chart-empty">データがありません。</div>;
  }

  const segments = TRANSITION_CATEGORIES.map((category, index) => {
    const count = transitions[category];
    const before = TRANSITION_CATEGORIES.slice(0, index).reduce(
      (sum, current) => sum + transitions[current],
      0,
    );
    return {
      category,
      count,
      dashOffset: -(before / total) * CIRCUMFERENCE,
      length: (count / total) * CIRCUMFERENCE,
    };
  }).filter((segment) => segment.count > 0);

  return (
    <div className="donut-layout">
      <svg
        aria-label="リンク遷移の内訳"
        className="donut-chart"
        role="img"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        <title>リンク遷移の内訳</title>
        <circle
          cx={CENTER}
          cy={CENTER}
          fill="none"
          r={RADIUS}
          stroke="var(--chart-track)"
          strokeWidth="18"
        />
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          {segments.map((segment) => (
            <circle
              cx={CENTER}
              cy={CENTER}
              fill="none"
              key={segment.category}
              r={RADIUS}
              stroke={TRANSITION_COLORS[segment.category]}
              strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
              strokeDashoffset={segment.dashOffset}
              strokeWidth="18"
            >
              <title>
                {TRANSITION_LABELS[segment.category]}: {formatCount(segment.count)} (
                {formatPercent(segment.count, total)})
              </title>
            </circle>
          ))}
        </g>
        <text
          fill="var(--text)"
          fontSize="18"
          fontWeight="600"
          textAnchor="middle"
          x={CENTER}
          y={CENTER - 2}
        >
          {formatCount(total)}
        </text>
        <text fill="var(--text-muted)" fontSize="8" textAnchor="middle" x={CENTER} y={CENTER + 12}>
          合計
        </text>
      </svg>

      <ul className="donut-legend">
        {TRANSITION_CATEGORIES.map((category) => {
          const count = transitions[category];
          if (count === 0) return null;
          return (
            <li key={category}>
              <span
                className="legend-swatch"
                style={{ backgroundColor: TRANSITION_COLORS[category] }}
              />
              <span className="legend-label">{TRANSITION_LABELS[category]}</span>
              <span className="legend-value">{formatPercent(count, total)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
