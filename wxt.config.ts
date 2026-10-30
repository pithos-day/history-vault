import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'History Vault',
    description: 'A private vault for your browsing history.',
    permissions: ['history', 'storage', 'unlimitedStorage', 'favicon', 'alarms'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'history-vault@pithos.day',
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    }),
  }),
});
