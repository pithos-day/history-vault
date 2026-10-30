import { formatCount } from '@/utils/date';
import type { ImportState } from '@/utils/history/types';

interface ImportBannerProps {
  state: ImportState;
  onStart: () => void;
  onDismiss: () => void;
}

export function ImportBanner({ state, onStart, onDismiss }: ImportBannerProps) {
  if (state.phase !== 'running' && state.phase !== 'error') return null;

  const progress =
    state.daysTotal > 0 ? Math.min(100, Math.round((state.daysDone / state.daysTotal) * 100)) : 0;

  return (
    <div className={`import-banner ${state.phase === 'error' ? 'is-error' : ''}`} role="status">
      <div className="import-banner-main">
        <span className="import-banner-title">
          {state.phase === 'error'
            ? '履歴の取り込みに失敗しました'
            : '既存の履歴を取り込んでいます'}
        </span>
        <span className="import-banner-detail">
          {state.phase === 'error'
            ? state.error
            : `${formatCount(state.daysDone)}日 / ${formatCount(state.daysTotal)}日 ・ ${formatCount(state.pages)}ページ ・ ${formatCount(state.visits)}訪問`}
        </span>
      </div>
      {state.phase === 'running' ? (
        <div
          aria-label={`取り込み進捗 ${progress}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="import-progress"
          role="progressbar"
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="import-banner-actions">
        {state.phase === 'error' ? (
          <button className="text-button" onClick={onStart} type="button">
            再試行
          </button>
        ) : null}
        <button className="text-button" onClick={onDismiss} type="button">
          閉じる
        </button>
      </div>
    </div>
  );
}
