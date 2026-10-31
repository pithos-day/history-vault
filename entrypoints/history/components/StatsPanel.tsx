import { X as CloseIcon } from 'lucide-react';
import { formatCount, formatInclusiveDateSpan } from '@/utils/date';
import type { RangeStats } from '@/utils/history/types';
import { ActivityChart } from './ActivityChart';
import { TopDomains } from './TopDomains';
import { TransitionDonut } from './TransitionDonut';

interface StatsPanelProps {
  stats: RangeStats | null;
  loading: boolean;
  rangeLabel: string;
  onClose: () => void;
}

export function StatsPanel({ stats, loading, rangeLabel, onClose }: StatsPanelProps) {
  const displayedRange = stats ? formatInclusiveDateSpan(stats.start, stats.end) : rangeLabel;

  const content = stats ? (
    <div className="stats-scroll">
      <section className="stats-section">
        <div className="stats-section-heading">
          <h2>閲覧アクティビティ</h2>
          <span>{formatCount(stats.views)} 閲覧</span>
        </div>
        <ActivityChart label={displayedRange} maxViews={stats.maxViews} points={stats.series} />
        <div className="chart-legend">
          <span>
            <i className="legend-dot legend-dot-views" />
            閲覧数
          </span>
          <span>
            <i className="legend-dot legend-dot-pages" />
            ページ数
          </span>
        </div>
      </section>

      <section className="stats-section">
        <div className="stats-section-heading">
          <h2>リンク遷移の種類</h2>
        </div>
        <TransitionDonut transitions={stats.transitions} />
      </section>

      <section className="stats-section">
        <div className="stats-section-heading">
          <h2>上位ドメイン</h2>
        </div>
        <TopDomains domains={stats.topDomains} total={stats.domainCount} />
      </section>
    </div>
  ) : (
    <div className="stats-loading">{loading ? '読み込み中…' : '統計を読み込めませんでした。'}</div>
  );

  return (
    <aside aria-label="履歴の統計" className="stats-panel">
      <header className="panel-header stats-header">
        <div>
          <span className="panel-title">統計</span>
          <span className="stats-range">{displayedRange}</span>
        </div>
        <button
          aria-label="統計を閉じる"
          className="icon-button icon-button-small"
          onClick={onClose}
          type="button"
        >
          <CloseIcon size={15} />
        </button>
      </header>

      {content}
    </aside>
  );
}
