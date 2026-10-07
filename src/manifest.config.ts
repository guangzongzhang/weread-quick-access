import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

// Chrome MV3 主 manifest
// Firefox 兼容由构建后处理脚本调整（service_worker -> background.scripts）
export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extName__',
  short_name: 'WeRead',
  description: '__MSG_extDesc__',
  version: pkg.version,
  default_locale: 'zh_CN',
  permissions: ['storage', 'tabs', 'cookies', 'scripting', 'contextMenus', 'webNavigation'],
  host_permissions: ['https://weread.qq.com/*', 'https://i.weread.qq.com/*'],
  omnibox: {
    keyword: 'wr',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'public/icons/icon16.png',
      '32': 'public/icons/icon32.png',
      '48': 'public/icons/icon48.png',
      '128': 'public/icons/icon128.png',
    },
  },
  icons: {
    '16': 'public/icons/icon16.png',
    '32': 'public/icons/icon32.png',
    '48': 'public/icons/icon48.png',
    '128': 'public/icons/icon128.png',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: false,
  },
  content_scripts: [
    {
      matches: ['https://weread.qq.com/*'],
      js: ['src/contents/reader-enhance.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['public/icons/*'],
      matches: ['https://weread.qq.com/*'],
    },
  ],
  commands: {
    _execute_action: {
      suggested_key: {
        default: 'Ctrl+Shift+W',
        mac: 'Command+Shift+W',
      },
      description: '__MSG_cmdOpenPopup__',
    },
    search_in_weread: {
      suggested_key: {
        default: 'Ctrl+Shift+S',
        mac: 'Command+Shift+S',
      },
      description: '__MSG_cmdSearch__',
    },
  },
});
