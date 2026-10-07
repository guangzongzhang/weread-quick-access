/**
 * 多账户存储模型
 *
 * 数据结构：{ activeId: string; accounts: Account[] }
 * 兼容老版 `wereadAccount` 单账户数据：首次启动自动迁移为多账户列表的第一项。
 */

import type { CipherPayload } from './crypto';
import type { EncryptedCookieBundle } from './cookie-store';

const STORAGE_KEY = 'accounts_v2';
const LEGACY_KEY = 'wereadAccount';
const ACTIVE_DEFAULT = '';

export interface Account {
  id: string;
  name: string;
  userId?: string;
  createdAt: number;
  lastUsedAt: number;
  cookieBundle: EncryptedCookieBundle | null;
  localStorageCipher: CipherPayload | null;
}

export interface AccountStoreData {
  activeId: string;
  accounts: Account[];
}

export async function loadStore(): Promise<AccountStoreData> {
  const result = await chrome.storage.local.get([STORAGE_KEY, LEGACY_KEY]);
  const data = (result[STORAGE_KEY] as AccountStoreData | undefined) ?? {
    activeId: ACTIVE_DEFAULT,
    accounts: [],
  };
  if (!data.accounts) data.accounts = [];

  // 兼容老数据迁移：仅在尚未初始化 v2 数据、且存在 legacy 数据时执行
  if (!result[STORAGE_KEY] && result[LEGACY_KEY]) {
    const migrated = migrateLegacyAccount(result[LEGACY_KEY]);
    if (migrated) {
      data.accounts.push(migrated);
      data.activeId = migrated.id;
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
      await chrome.storage.local.remove(LEGACY_KEY);
    }
  }
  return data;
}

export async function saveStore(data: AccountStoreData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function generateId(): string {
  return `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function migrateLegacyAccount(legacy: unknown): Account | null {
  if (!legacy || typeof legacy !== 'object') return null;
  const obj = legacy as Record<string, unknown>;
  return {
    id: generateId(),
    name: (obj.name as string) || '微信读书账户',
    userId: (obj.userId as string) || undefined,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    // 老 Cookie 不加密，直接搬迁不安全；下次保存时重新加密
    cookieBundle: null,
    localStorageCipher: null,
  };
}

export async function listAccounts(): Promise<Account[]> {
  const data = await loadStore();
  return data.accounts;
}

export async function getActiveAccount(): Promise<Account | null> {
  const data = await loadStore();
  return data.accounts.find((a) => a.id === data.activeId) ?? null;
}

export async function setActiveAccount(id: string): Promise<void> {
  const data = await loadStore();
  if (!data.accounts.some((a) => a.id === id)) {
    throw new Error(`账户不存在: ${id}`);
  }
  data.activeId = id;
  await saveStore(data);
}

export async function upsertAccount(
  partial: Pick<Account, 'name'> & Partial<Omit<Account, 'id' | 'createdAt'>>,
): Promise<Account> {
  const data = await loadStore();
  // 优先用 userId 判定同一账户；退化为按昵称匹配。
  // 仅按昵称匹配时，若昵称抓取失败（回退为通用名），会误覆盖另一个账户，
  // 因此调用方应尽量传入 userId（见 service-worker 从 wr_vid 提取）。
  const existing = partial.userId
    ? data.accounts.find((a) => a.userId === partial.userId)
    : data.accounts.find((a) => a.name === partial.name);
  let account: Account;
  if (existing) {
    Object.assign(existing, partial, { lastUsedAt: Date.now() });
    account = existing;
  } else {
    account = {
      id: generateId(),
      name: partial.name,
      userId: partial.userId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      cookieBundle: partial.cookieBundle ?? null,
      localStorageCipher: partial.localStorageCipher ?? null,
    };
    data.accounts.push(account);
  }
  data.activeId = account.id;
  await saveStore(data);
  return account;
}

export async function removeAccount(id: string): Promise<void> {
  const data = await loadStore();
  data.accounts = data.accounts.filter((a) => a.id !== id);
  if (data.activeId === id) {
    data.activeId = data.accounts[0]?.id ?? ACTIVE_DEFAULT;
  }
  await saveStore(data);
}

export async function renameAccount(id: string, name: string): Promise<void> {
  const data = await loadStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) throw new Error(`账户不存在: ${id}`);
  account.name = name;
  await saveStore(data);
}

export async function clearAllAccounts(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEY, LEGACY_KEY]);
}
