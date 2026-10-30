import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');

if (!root) {
  throw new Error('History page root element not found');
}

createRoot(root).render(
  <StrictMode>
    <main>History Vault</main>
  </StrictMode>,
);
