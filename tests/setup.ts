import { vi } from 'vitest';

/**
 * chrome API mock：覆盖 storage.local / cookies / runtime / tabs / scripting / webNavigation
 * 单元测试用，不依赖真实浏览器。
 */

const localStore: Record<string, unknown> = {};
const sessionStore: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (!keys) return { ...localStore };
        const arr = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of arr) if (k in localStore) result[k] = localStore[k];
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(localStore, items);
        return;
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete localStore[k];
        return;
      }),
    },
    session: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (!keys) return { ...sessionStore };
        const arr = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of arr) if (k in sessionStore) result[k] = sessionStore[k];
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
        return;
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete sessionStore[k];
        return;
      }),
    },
  },
  cookies: {
    getAll: vi.fn(async () => [] as chrome.cookies.Cookie[]),
    set: vi.fn(async () => undefined),
  },
  runtime: {
    sendMessage: vi.fn(async () => ({ ok: true, data: null })),
    onMessage: {
      addListener: vi.fn(),
    },
    id: 'test-extension-id',
    getManifest: vi.fn(() => ({ manifest_version: 3, version: '2.0.0' })),
    openOptionsPage: vi.fn(async () => undefined),
    onInstalled: { addListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: 1 }) as unknown as chrome.tabs.Tab),
    reload: vi.fn(async () => undefined),
    onRemoved: { addListener: vi.fn() },
  },
  scripting: {
    executeScript: vi.fn(async () => [{ result: {} }]),
  },
  webNavigation: {
    onCommitted: { addListener: vi.fn() },
    onHistoryStateChanged: { addListener: vi.fn() },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
  commands: {
    onCommand: { addListener: vi.fn() },
  },
  i18n: {
    getMessage: vi.fn((key: string) => key),
    getUILanguage: vi.fn(() => 'zh_CN'),
  },
};

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

export { chromeMock, localStore, sessionStore };

// 清理函数，每个 test 调用前重置
export function resetChromeMock(): void {
  for (const k of Object.keys(localStore)) delete localStore[k];
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
  vi.clearAllMocks();
}
