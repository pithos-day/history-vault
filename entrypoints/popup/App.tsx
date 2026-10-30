import { browser } from 'wxt/browser';
import { formatVersion } from '@/utils/version';

const vaultMark = (
  <svg viewBox="0 0 128 128" role="presentation">
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
  const manifest = browser.runtime.getManifest();

  return (
    <main className="app">
      <header className="brand">
        <div className="brand-mark" aria-hidden="true">
          {vaultMark}
        </div>
        <div>
          <h1>{manifest.name}</h1>
          <p>Your browsing history, organized.</p>
        </div>
      </header>

      <section className="panel" aria-labelledby="status-title">
        <p className="eyebrow">Foundation ready</p>
        <h2 id="status-title">Your vault is standing by.</h2>
        <p className="copy">
          The extension shell is in place. History browsing, search, and collections can be built on
          top of this base.
        </p>
        <ul className="checklist">
          <li>React + TypeScript</li>
          <li>WXT manifest generation</li>
          <li>Biome, ESLint, and Vitest</li>
        </ul>
      </section>

      <footer className="footer">
        <span>{formatVersion(manifest.version)}</span>
        <span>Built with WXT</span>
      </footer>
    </main>
  );
}
