import { createPortal } from 'react-dom';

interface WelcomeDialogProps {
  onClose: () => void;
}

export function WelcomeDialog({ onClose }: WelcomeDialogProps) {
  return createPortal(
    <div className="modal-backdrop">
      <div
        aria-labelledby="welcome-title"
        aria-modal="true"
        className="modal welcome-dialog"
        role="dialog"
      >
        <p className="eyebrow">History Vault</p>
        <h2 id="welcome-title">履歴を、ずっと手元に。</h2>
        <p>
          Chromeは既定で約90日分の履歴しか保持しません。History Vaultは閲覧履歴をこの端末に保存し、
          ブラウザの保持期間が過ぎてもVivaldi風の履歴ページから探せるようにします。
        </p>
        <ul className="welcome-list">
          <li>既存の履歴をバックグラウンドでインポート</li>
          <li>カレンダー、日別エントリ、閲覧統計</li>
          <li>データはローカルのみ。外部送信はありません</li>
        </ul>
        <p className="welcome-note">
          すでに90日を過ぎて削除された履歴は復元できません。また、拡張機能を削除するとVaultのデータも削除されるため、必要に応じて設定からエクスポートしてください。
        </p>
        <div className="modal-actions">
          <button className="button" onClick={onClose} type="button">
            はじめる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
