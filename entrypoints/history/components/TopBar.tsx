import type { RefObject } from 'react';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  InfoIcon,
  SearchIcon,
  SettingsIcon,
} from '../lib/icons';
import type { ViewMode } from '../lib/viewState';

interface TopBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  title: string;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  calendarVisible: boolean;
  onToggleCalendar: () => void;
  statsVisible: boolean;
  onToggleStats: () => void;
  onOpenSettings: () => void;
}

const VIEWS: Array<{ value: ViewMode; label: string }> = [
  { value: 'list', label: 'リスト' },
  { value: 'day', label: '日' },
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
];

export function TopBar({
  query,
  onQueryChange,
  searchInputRef,
  title,
  view,
  onViewChange,
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
          今月
        </button>
        <div className="nav-buttons">
          <button aria-label="前へ" className="icon-button" onClick={onPrevious} type="button">
            <ChevronLeftIcon />
          </button>
          <button aria-label="次へ" className="icon-button" onClick={onNext} type="button">
            <ChevronRightIcon />
          </button>
        </div>

        <div className="segmented">
          {VIEWS.map((item) => (
            <button
              aria-pressed={view === item.value}
              className={`segmented-button ${view === item.value ? 'is-active' : ''}`}
              key={item.value}
              onClick={() => onViewChange(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
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
