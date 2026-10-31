import {
  Calendar as CalendarIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  X as CloseIcon,
  Info as InfoIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { RefObject } from 'react';

interface TopBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  title: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  calendarVisible: boolean;
  onToggleCalendar: () => void;
  statsVisible: boolean;
  onToggleStats: () => void;
  onOpenSettings: () => void;
}

export function TopBar({
  query,
  onQueryChange,
  searchInputRef,
  title,
  onPrevious,
  onNext,
  onToday,
  calendarVisible,
  onToggleCalendar,
  statsVisible,
  onToggleStats,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          aria-label={calendarVisible ? 'カレンダーを隠す' : 'カレンダーを表示'}
          aria-pressed={calendarVisible}
          className={`icon-button ${calendarVisible ? 'is-active' : ''}`}
          onClick={onToggleCalendar}
          title={calendarVisible ? 'カレンダーを隠す' : 'カレンダーを表示'}
          type="button"
        >
          <CalendarIcon />
        </button>

        <div className="search-field">
          <SearchIcon className="search-icon" size={16} />
          <input
            aria-label="履歴を検索"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="履歴を検索"
            ref={searchInputRef}
            spellCheck={false}
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="検索をクリア"
              className="search-clear"
              onClick={() => onQueryChange('')}
              type="button"
            >
              <CloseIcon size={14} />
            </button>
          ) : (
            <kbd className="search-hint">/</kbd>
          )}
        </div>
      </div>

      <div className="topbar-title">{title}</div>

      <div className="topbar-right">
        <button className="pill-button" onClick={onToday} type="button">
          今日
        </button>
        <div className="nav-buttons">
          <button aria-label="前へ" className="icon-button" onClick={onPrevious} type="button">
            <ChevronLeftIcon />
          </button>
          <button aria-label="次へ" className="icon-button" onClick={onNext} type="button">
            <ChevronRightIcon />
          </button>
        </div>

        <button
          aria-label={statsVisible ? '統計を隠す' : '統計を表示'}
          aria-pressed={statsVisible}
          className={`icon-button ${statsVisible ? 'is-active' : ''}`}
          onClick={onToggleStats}
          title={statsVisible ? '統計を隠す' : '統計を表示'}
          type="button"
        >
          <InfoIcon />
        </button>
        <button aria-label="設定" className="icon-button" onClick={onOpenSettings} type="button">
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
