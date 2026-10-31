import {
  X as CloseIcon,
  Database as DatabaseIcon,
  Download as DownloadIcon,
  Trash2 as TrashIcon,
  Upload as UploadIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { formatCount } from '@/utils/date';
import { downloadVaultCsv, downloadVaultJson, importVaultFile } from '@/utils/export';
import { formatBytes } from '@/utils/format';
import { getStorageEstimate } from '@/utils/history/query';
import type { ImportState } from '@/utils/history/types';
import type { Settings, ThemeSetting } from '@/utils/settings';
import type { VaultRevision } from '@/utils/vault-events';
import { formatVersion } from '@/utils/version';
import { useVaultCounts } from '../hooks/useVaultCounts';

interface SettingsDialogProps {
  settings: Settings;
  importState: ImportState;
  revision: VaultRevision;
  onUpdate: (patch: Partial<Settings>) => Promise<unknown>;
  onClose: () => void;
  onStartImport: () => void;
  onClearVault: () => void;
  onToast: (message: string) => void;
}

export function SettingsDialog({
  settings,
  importState,
  revision,
  onUpdate,
  onClose,
  onStartImport,
  onClearVault,
  onToast,
}: SettingsDialogProps) {
  const counts = useVaultCounts(revision);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manifest = browser.runtime.getManifest();

  useEffect(() => {
    let active = true;
    void getStorageEstimate().then((value) => {
      if (active) setStorage(value);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleImportFile = async (file: File) => {
    setBusy(true);
    setImportProgress('読み込み中…');
    try {
      const result = await importVaultFile(file, (processed, total) => {
        setImportProgress(`${formatCount(processed)} / ${formatCount(total)}`);
      });
      onToast(
        `${formatCount(result.pages)}ページ、${formatCount(result.visits)}訪問をインポートしました。`,
      );
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setImportProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    setBusy(true);
    try {
      if (format === 'json') await downloadVaultJson();
      else await downloadVaultCsv();
      onToast(`${format.toUpperCase()}をエクスポートしました。`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        aria-labelledby="settings-title"
        aria-modal="true"
        className="modal settings-dialog"
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <h2 id="settings-title">設定</h2>
            <p>History Vault {formatVersion(manifest.version)}</p>
          </div>
          <button aria-label="設定を閉じる" className="icon-button" onClick={onClose} type="button">
            <CloseIcon />
          </button>
        </header>

        <div className="settings-scroll">
          <section className="settings-section">
            <h3>表示</h3>
            <label className="setting-row">
              <span>
                テーマ
                <small>システム設定に合わせるか、ライト/ダークを固定します。</small>
              </span>
              <select
                onChange={(event) => void onUpdate({ theme: event.target.value as ThemeSetting })}
                value={settings.theme}
              >
                <option value="system">システム</option>
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
              </select>
            </label>
            <label className="setting-row">
              <span>
                週の開始
                <small>カレンダーの先頭曜日です。</small>
              </span>
              <select
                onChange={(event) =>
                  void onUpdate({ weekStartsOn: Number(event.target.value) === 1 ? 1 : 0 })
                }
                value={settings.weekStartsOn}
              >
                <option value={0}>日曜日</option>
                <option value={1}>月曜日</option>
              </select>
            </label>
          </section>

          <section className="settings-section">
            <h3>データ保持</h3>
            <label className="setting-row setting-row-toggle">
              <span>
                ブラウザの履歴削除に追従
                <small>
                  OFFの場合、Chromeの履歴を消してもVaultには残ります。Vaultから明示的に削除するまで保管されます。
                </small>
              </span>
              <input
                checked={settings.mirrorBrowserDeletes}
                onChange={(event) => void onUpdate({ mirrorBrowserDeletes: event.target.checked })}
                type="checkbox"
              />
            </label>
          </section>

          <section className="settings-section">
            <h3>履歴のインポート</h3>
            <label className="setting-row">
              <span>
                取り込む期間
                <small>Chromeに残っている履歴だけが対象です。</small>
              </span>
              <select
                onChange={(event) =>
                  void onUpdate({
                    importWindowDays:
                      Number(event.target.value) === 0
                        ? 0
                        : Number(event.target.value) === 365
                          ? 365
                          : 90,
                  })
                }
                value={settings.importWindowDays}
              >
                <option value={90}>直近90日</option>
                <option value={365}>直近1年</option>
                <option value={0}>可能な限りすべて</option>
              </select>
            </label>
            <div className="setting-row">
              <span>
                現在のVault
                <small>
                  {formatCount(counts.pages)}ページ / {formatCount(counts.visits)}訪問
                  {importState.phase === 'running'
                    ? ` ・ 取り込み中 ${formatCount(importState.daysDone)}日`
                    : ''}
                </small>
              </span>
              <button
                className="button button-secondary"
                disabled={importState.phase === 'running'}
                onClick={onStartImport}
                type="button"
              >
                再インポート
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>データ管理</h3>
            <div className="setting-row">
              <span>
                ストレージ使用量
                <small>
                  {storage
                    ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`
                    : '取得できませんでした'}
                </small>
              </span>
              <DatabaseIcon className="setting-icon" />
            </div>
            <div className="settings-button-row">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => void handleExport('json')}
                type="button"
              >
                <DownloadIcon size={15} />
                JSON
              </button>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => void handleExport('csv')}
                type="button"
              >
                <DownloadIcon size={15} />
                CSV
              </button>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <UploadIcon size={15} />
                インポート
              </button>
              <input
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImportFile(file);
                }}
                ref={fileInputRef}
                type="file"
              />
            </div>
            {importProgress ? <p className="setting-progress">{importProgress}</p> : null}
            <p className="settings-note">
              エクスポートファイルには閲覧履歴が含まれます。安全な場所に保存してください。拡張機能を削除するとVaultのデータも削除されます。
            </p>
            <button
              className="button button-danger button-full"
              onClick={onClearVault}
              type="button"
            >
              <TrashIcon size={15} />
              Vaultを全消去
            </button>
          </section>

          <section className="settings-section settings-about">
            <h3>この拡張機能について</h3>
            <p>
              閲覧履歴はこの端末のIndexedDBにのみ保存されます。外部サーバーへの送信、分析、広告はありません。
              Ctrl+H / chrome://history がHistory Vaultのページに置き換わっています。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
