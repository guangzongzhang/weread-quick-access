/**
 * MV3 service worker：统一账户逻辑入口
 *
 * 修复：
 * - onInstalled 默认 autoLogin=false（不再强制 true 未告知用户）
 * - 用 webNavigation.onCommitted 替代 tabs.onUpdated（避免 SPA 路由重复触发）
 * - 通过 chrome.scripting.executeScript 注入后 reload（修复原 complete 阶段注入但页面已加载的 Bug）
 * - session 标记防止本会话重复 reload
 */

import {
  loadStore,
  upsertAccount,
  removeAccount as removeAccountFn,
  renameAccount as renameAccountFn,
  clearAllAccounts,
  getActiveAccount,
  setActiveAccount,
} from '@/lib/auth/account-store';
import {
  captureWhitelistedCookies,
  decryptCookies,
  decryptLocalStorage,
  encryptCookies,
  encryptLocalStorage,
  restoreCookies,
} from '@/lib/auth/cookie-store';
import { onBg, startMessageRouter } from '@/lib/messaging/bridge';
import { MsgType, type AccountBrief, type ShelfBook } from '@/lib/messaging/types';
import { getShelfPreview, getRecentBook, getAllShelfBooks, enrichBookUrl } from '@/lib/api/weread-client';
import { extractReaderIdFromDeepLink } from '@/lib/api/deep-link';

const WEREAD_URL = 'https://weread.qq.com/';
const SETTINGS_KEY = 'settings_v2';
const RESTORE_PREFIX = 'restored_';

interface Settings {
  autoLogin: boolean;
}

async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return (result[SETTINGS_KEY] as Settings) ?? { autoLogin: false };
}

async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}

function toBrief(
  account: { id: string; name: string; userId?: string; createdAt: number; lastUsedAt: number },
  activeId: string,
): AccountBrief {
  return {
    id: account.id,
    name: account.name,
    userId: account.userId,
    createdAt: account.createdAt,
    lastUsedAt: account.lastUsedAt,
    isActive: account.id === activeId,
  };
}

// ---------- 消息路由 ----------
onBg<AccountBrief[]>(MsgType.LIST_ACCOUNTS, async () => {
  const data = await loadStore();
  return data.accounts.map((a) => toBrief(a, data.activeId));
});

onBg<AccountBrief | null>(MsgType.GET_ACTIVE, async () => {
  const data = await loadStore();
  const active = data.accounts.find((a) => a.id === data.activeId);
  return active ? toBrief(active, data.activeId) : null;
});

onBg<AccountBrief>(MsgType.SET_ACTIVE, async (payload) => {
  const { id } = payload as { id: string };
  await setActiveAccount(id);
  const data = await loadStore();
  const acc = data.accounts.find((a) => a.id === id);
  if (!acc) throw new Error(`账户不存在: ${id}`);
  return toBrief(acc, id);
});

onBg<boolean>(MsgType.GET_AUTO_LOGIN, async () => {
  const s = await getSettings();
  return s.autoLogin;
});

onBg<boolean>(MsgType.SET_AUTO_LOGIN, async (payload) => {
  const { autoLogin } = payload as { autoLogin: boolean };
  await setSettings({ autoLogin });
  return autoLogin;
});

onBg<AccountBrief>(MsgType.SAVE_CURRENT, async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('weread.qq.com')) {
    throw new Error('请先打开微信读书页面');
  }
  const tabId = tab.id;

  // 并行抓 Cookie + localStorage + 用户名
  const [cookies, lsResult, nameResult] = await Promise.all([
    captureWhitelistedCookies(),
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const data: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) data[k] = localStorage.getItem(k) ?? '';
        }
        return data;
      },
    }),
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selectors = ['.readerAvatar_nick', '.nav_user_name', '[class*="nick"]'];
        for (const s of selectors) {
          const el = document.querySelector(s);
          if (el && el.textContent?.trim()) return el.textContent.trim();
        }
        return '微信读书账户';
      },
    }),
  ]);

  const [cookieBundle, lsCipher] = await Promise.all([
    encryptCookies(cookies),
    encryptLocalStorage(lsResult?.[0]?.result as Record<string, string>),
  ]);
  const rawName = (nameResult?.[0]?.result as string) || '';
  // 昵称抓取可能失败（页面结构变化），此时回退为通用名。
  // 通用名在多账户场景下会互相覆盖，因此用 wr_vid（微信读书用户 ID）作为稳定身份。
  const userId = cookies.find((c) => c.name === 'wr_vid')?.value || undefined;
  const name = rawName || (userId ? `微信读书 ${userId.slice(-6)}` : '微信读书账户');

  const account = await upsertAccount({
    name,
    userId,
    cookieBundle,
    localStorageCipher: lsCipher,
  });
  const data = await loadStore();
  const saved = data.accounts.find((a) => a.id === account.id);
  if (!saved) throw new Error('保存失败');
  return toBrief(saved, account.id);
});

onBg<boolean>(MsgType.REMOVE_ACCOUNT, async (payload) => {
  const { id } = payload as { id: string };
  await removeAccountFn(id);
  return true;
});

onBg<boolean>(MsgType.RENAME_ACCOUNT, async (payload) => {
  const { id, name } = payload as { id: string; name: string };
  await renameAccountFn(id, name);
  return true;
});

onBg<boolean>(MsgType.CLEAR_ALL, async () => {
  await clearAllAccounts();
  return true;
});

onBg<boolean>(MsgType.OPEN_WEREAD, async () => {
  await chrome.tabs.create({ url: WEREAD_URL });
  return true;
});

// 调用 weread Web API 抓书架预览（失败时调用方降级为快捷链接）
onBg<ShelfBook[]>(MsgType.GET_SHELF_PREVIEW, async () => {
  try {
    return await getShelfPreview();
  } catch (e) {
    console.warn('[service-worker] GET_SHELF_PREVIEW 失败，返回空列表', e);
    return [] as ShelfBook[];
  }
});

// 取完整书架（用于 options 阅读看板）
// 注意：不在此处调用 enrichBookUrl，避免对大量书籍并发 API 调用导致消息通道超时
// options 页面使用详情页 URL（数字 ID 有效），popup 的续读/书架预览才需要校正
onBg<ShelfBook[]>(MsgType.GET_ALL_SHELF, async () => {
  try {
    return await getAllShelfBooks();
  } catch (e) {
    console.warn('[service-worker] GET_ALL_SHELF 失败，返回空列表', e);
    return [] as ShelfBook[];
  }
});

// 取最近阅读的书（用于一键续读）
onBg<ShelfBook | null>(MsgType.GET_RECENT_BOOK, async () => {
  try {
    return await getRecentBook();
  } catch (e) {
    console.warn('[service-worker] GET_RECENT_BOOK 失败', e);
    return null;
  }
});

// ---------- 自动登录 ----------
async function handleWereadNavigation(details: {
  tabId: number;
  frameId?: number;
  url?: string;
}): Promise<void> {
  if (!details.url?.includes('weread.qq.com')) return;
  // 只处理主框架：iframe 内的导航会重复触发，导致反复恢复登录态
  if (details.frameId !== undefined && details.frameId !== 0) return;
  const settings = await getSettings();
  if (!settings.autoLogin) return;
  const active = await getActiveAccount();
  if (!active?.cookieBundle) return;

  // 本会话已恢复过则跳过，避免 SPA 路由触发重复 reload
  const sessionKey = `${RESTORE_PREFIX}${details.tabId}`;
  const session = await chrome.storage.session.get(sessionKey);
  if (session[sessionKey]) return;

  const cookies = await decryptCookies(active.cookieBundle);
  await restoreCookies(cookies);

  if (active.localStorageCipher) {
    const ls = await decryptLocalStorage(active.localStorageCipher);
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: (data: Record<string, string>) => {
        for (const k in data) {
          try {
            localStorage.setItem(k, data[k]);
          } catch (e) {
            console.warn('[restore] localStorage 写入失败', k, e);
          }
        }
      },
      args: [ls],
    });
  }

  await chrome.storage.session.set({ [sessionKey]: Date.now() });
  // reload 一次让 Cookie 生效（修复原未 reload 的 Bug）
  await chrome.tabs.reload(details.tabId);
}

// ---------- 启动（消息路由优先，确保 popup 通信可用）----------// 启动消息路由
startMessageRouter();

chrome.runtime.onInstalled.addListener(async (details) => {
  // 仅在首次安装时写入默认值；扩展更新时不能覆盖用户已有的设置
  if (details.reason === 'install') {
    await setSettings({ autoLogin: false });
    try {
      chrome.runtime.openOptionsPage();
    } catch (e) {
      console.warn('[service-worker] openOptionsPage 失败', e);
    }
  }
  // 右键菜单：更新时会残留旧菜单项，先清理再创建，否则重复 id 抛错
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'search-in-weread',
      title: '在微信读书搜索 "%s"',
      contexts: ['selection'],
    });
  });
});

chrome.webNavigation.onCommitted.addListener(handleWereadNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleWereadNavigation);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'search-in-weread' && info.selectionText) {
    const url = `https://weread.qq.com/#/search?query=${encodeURIComponent(info.selectionText)}`;
    chrome.tabs.create({ url });
  }
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'search_in_weread') {
    await chrome.tabs.create({ url: 'https://weread.qq.com/#/search' });
  }
});

// Omnibox：地址栏输入 wr <关键词> → 调搜索 API → 跳转到第一本书的阅读页
chrome.omnibox?.onInputEntered.addListener(async (text) => {
  const keyword = text.trim();
  if (!keyword) {
    await chrome.tabs.create({ url: 'https://weread.qq.com/' });
    return;
  }
  try {
    // 调用微信读书搜索 API
    const apiUrl = `https://weread.qq.com/web/search/global?keyword=${encodeURIComponent(keyword)}`;
    const cookieHeader = await getCookieHeaderForUrl('https://weread.qq.com/');
    const res = await fetch(apiUrl, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
    });
    if (res.ok) {
      const data = (await res.json()) as { books?: unknown[] };
      const books = Array.isArray(data.books) ? data.books : [];
      if (books.length > 0) {
        const first = books[0] as { bookInfo?: { deepLink?: string; bookId?: string | number } };
        const info = first.bookInfo ?? {};
        // 优先用 deepLink 提取阅读页 ID（支持 v 和 w 两种参数格式）
        if (info.deepLink) {
          const readerId = extractReaderIdFromDeepLink(info.deepLink);
          if (readerId) {
            await chrome.tabs.create({ url: `https://weread.qq.com/web/reader/${readerId}` });
            return;
          }
          // 提取不到阅读页 ID，直接用 deepLink（官方分享链接可正常打开）
          await chrome.tabs.create({ url: info.deepLink });
          return;
        }
        // 无 deepLink，用书籍详情页（数字 ID 可用）
        if (info.bookId) {
          await chrome.tabs.create({ url: `https://weread.qq.com/web/bookDetail/${info.bookId}` });
          return;
        }
      }
    }
  } catch (e) {
    console.warn('[omnibox] 搜索失败', e);
  }
  // 兜底：打开微信读书首页
  await chrome.tabs.create({ url: 'https://weread.qq.com/' });
});

/** 获取目标 URL 的 Cookie 字符串（omnibox 搜索用） */
async function getCookieHeaderForUrl(url: string): Promise<string> {
  const cookies = await chrome.cookies.getAll({ url });
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

// tab 关闭时清理 session 标记
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.storage.session.remove(`${RESTORE_PREFIX}${tabId}`);
});
