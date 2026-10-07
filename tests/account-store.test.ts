import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMock, localStore } from './setup';
import {
  loadStore,
  upsertAccount,
  removeAccount,
  renameAccount,
  setActiveAccount,
  clearAllAccounts,
  getActiveAccount,
} from '../src/lib/auth/account-store';

describe('account-store', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('首次 loadStore 返回空 store', async () => {
    const data = await loadStore();
    expect(data.activeId).toBe('');
    expect(data.accounts).toEqual([]);
  });

  it('upsertAccount 新增账户并设为 active', async () => {
    const acc = await upsertAccount({ name: '张三', cookieBundle: null, localStorageCipher: null });
    expect(acc.id).toMatch(/^acc_/);
    const active = await getActiveAccount();
    expect(active?.id).toBe(acc.id);
    expect(active?.name).toBe('张三');
  });

  it('upsertAccount 同名账户更新而非新增', async () => {
    await upsertAccount({ name: '张三', cookieBundle: null, localStorageCipher: null });
    await upsertAccount({ name: '张三', cookieBundle: null, localStorageCipher: null });
    const data = await loadStore();
    expect(data.accounts).toHaveLength(1);
  });

  it('多账户 setActiveAccount 切换 active', async () => {
    const a1 = await upsertAccount({ name: 'A', cookieBundle: null, localStorageCipher: null });
    const a2 = await upsertAccount({ name: 'B', cookieBundle: null, localStorageCipher: null });
    expect(a2.id).not.toBe(a1.id);
    await setActiveAccount(a1.id);
    const active = await getActiveAccount();
    expect(active?.id).toBe(a1.id);
  });

  it('removeAccount 删除后 active 顺延到第一个', async () => {
    const a1 = await upsertAccount({ name: 'A', cookieBundle: null, localStorageCipher: null });
    const a2 = await upsertAccount({ name: 'B', cookieBundle: null, localStorageCipher: null });
    await setActiveAccount(a2.id);
    await removeAccount(a2.id);
    const data = await loadStore();
    expect(data.accounts).toHaveLength(1);
    expect(data.activeId).toBe(a1.id);
  });

  it('renameAccount 修改名称', async () => {
    const acc = await upsertAccount({ name: '原名', cookieBundle: null, localStorageCipher: null });
    await renameAccount(acc.id, '新名');
    const active = await getActiveAccount();
    expect(active?.name).toBe('新名');
  });

  it('clearAllAccounts 清空 storage', async () => {
    await upsertAccount({ name: 'A', cookieBundle: null, localStorageCipher: null });
    await clearAllAccounts();
    const data = await loadStore();
    expect(data.accounts).toEqual([]);
  });

  it('兼容老版单账户数据迁移', async () => {
    // 直接注入老版数据
    localStore['wereadAccount'] = { name: '老账户', userId: 'u123' };
    const data = await loadStore();
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].name).toBe('老账户');
    expect(data.activeId).toBe(data.accounts[0].id);
    // 迁移后 legacy key 应被清除
    expect(localStore['wereadAccount']).toBeUndefined();
  });
});
