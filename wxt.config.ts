import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'History Vault',
    description: 'A private vault for your browsing history.',
    permissions: ['history', 'storage', 'unlimitedStorage', 'favicon', 'alarms', 'webNavigation'],
  },
});
