import {
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { formatCount, formatRelativeDateHeader, formatTime } from '@/utils/date';
import { getRecentPages, getVaultCounts } from '@/utils/history/query';
import type { ImportState, PageRecord } from '@/utils/history/types';
import { getDisplayUrl, isSupportedUrl } from '@/utils/url';
import { formatVersion } from '@/utils/version';
import { Favicon } from '../history/components/Favicon';
import { useImportState } from '../history/hooks/useImportState';
import { useResolvedTheme } from '../history/hooks/useResolvedTheme';
import { useSettings } from '../history/hooks/useSettings';
import { useVaultRevision } from '../history/hooks/useVaultRevision';

const vaultMark = (
  <svg aria-hidden="true" viewBox="0 0 128 128">
    <circle cx="64" cy="64" r="40" fill="none" stroke="currentColor" strokeWidth="10" />
    <path
      d="M64 64V40M64 64l18 12"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="9"
    />
    <circle cx="64" cy="64" r="7" fill="currentColor" />
  </svg>
);

export default function App() {
  const revision = useVaultRevision();
  const importState = useImportState();
  const { settings } = useSettings();
  useResolvedTheme(settings.theme);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [counts, setCounts] = useState({ pages: 0, visits: 0 });
  const manifest = browser.runtime.getManifest();

  useEffect(() => {
    let active = true;
    void revision;
    void Promise.all([getRecentPages(8), getVaultCounts()]).then(([recent, vaultCounts]) => {
      if (!active) return;
      setPages(recent);
      setCounts(vaultCounts);
    });

    return () => {
      active = false;
    };
  }, [revision]);

  const openHistory = (focusSearch = false) => {
    const url = new URL(browser.runtime.getURL('/history.html'));
    if (focusSearch) url.searchParams.set('focus', 'search');
    void browser.tabs.create({ url: url.toString() });
    window.close();
  };

  const openPage = (page: PageRecord) => {
    if (!isSupportedUrl(page.url)) return;
    void browser.tabs.create({ url: page.url });
    window.close();
  };

  return (
    <main className="popup">
      <header className="popup-header">
        <div className="popup-brand">
          <span className="brand-mark">{vaultMark}</span>
          <div>
            <h1>{manifest.name}</h1>
            <p>閲覧履歴のプライベート保管庫</p>
          </div>
        </div>
        <button
          aria-label="設定を開く"
          className="icon-button"
          onClick={() => openHistory()}
          title="履歴ページを開く"
          type="button"
        >
          <SettingsIcon size={17} />
        </button>
      </header>

      <div className="popup-actions">
        <button className="search-button" onClick={() => openHistory(true)} type="button">
          <SearchIcon size={15} />
          履歴を検索
          <kbd>/</kbd>
        </button>
      </div>

      {importState.phase === 'running' ? (
        <ImportSummary onOpen={() => openHistory()} state={importState} />
      ) : null}

      <section aria-labelledby="recent-title" className="recent-section">
        <div className="section-heading">
          <h2 id="recent-title">最近の履歴</h2>
          <span>
            {formatCount(counts.pages)}ページ / {formatCount(counts.visits)}訪問
          </span>
        </div>

        {pages.length > 0 ? (
          <ul className="recent-list">
            {pages.map((page) => (
              <li key={page.url}>
                <button className="recent-row" onClick={() => openPage(page)} type="button">
                  <Favicon host={page.host} size={16} url={page.url} />
                  <span className="recent-main">
                    <span className="recent-title">{page.title || page.url}</span>
                    <span className="recent-meta">
                      {getDisplayUrl(page.url)} ・ {formatRelativeDateHeader(page.lastVisitTime)}{' '}
                      {formatTime(page.lastVisitTime)}
                    </span>
                  </span>
                  <ChevronRightIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-recent">まだ履歴がありません。閲覧すると自動で保存されます。</p>
        )}
      </section>

      <footer className="popup-footer">
        <span>{formatVersion(manifest.version)}</span>
        <button className="open-button" onClick={() => openHistory()} type="button">
          履歴ページを開く
          <ChevronRightIcon size={14} />
        </button>
      </footer>
    </main>
  );
}

function ImportSummary({ state, onOpen }: { state: ImportState; onOpen: () => void }) {
  const progress =
    state.daysTotal > 0 ? Math.min(99, Math.round((state.daysDone / state.daysTotal) * 100)) : 0;

  return (
    <button className="import-summary" onClick={onOpen} type="button">
      <span className="import-summary-title">既存の履歴を取り込み中</span>
      <span className="import-summary-detail">
        {formatCount(state.daysDone)}日 / {formatCount(state.daysTotal)}日
      </span>
      <span className="import-summary-track">
        <span style={{ width: `${progress}%` }} />
      </span>
    </button>
  );
}
