import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from './setup';
import {
  captureWhitelistedCookies,
  encryptCookies,
  decryptCookies,
  restoreCookies,
  encryptLocalStorage,
  decryptLocalStorage,
  type SerializedCookie,
} from '../src/lib/auth/cookie-store';

const fakeCookie = (name: string, opts: Partial<SerializedCookie> = {}): SerializedCookie => ({
  name,
  value: `val_${name}`,
  domain: 'weread.qq.com',
  path: '/',
  secure: true,
  httpOnly: false,
  sameSite: 'lax',
  ...opts,
});

describe('cookie-store', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('captureWhitelistedCookies 仅返回白名单且 weread 域 Cookie', async () => {
    chromeMock.cookies.getAll.mockResolvedValue([
      // 白名单内
      { name: 'wr_vid', value: 'v1', domain: 'weread.qq.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax' },
      { name: 'wr_skey', value: 'k1', domain: '.weread.qq.com', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction' },
      // 白名单外（应被过滤）
      { name: 'qq_plugin', value: 'x', domain: '.qq.com', path: '/', secure: false, httpOnly: false, sameSite: 'unspecified' },
      // 白名单但不在 weread 域（应被过滤）
      { name: 'wr_vid', value: 'other', domain: 'other.qq.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax' },
    ] as never);
    const result = await captureWhitelistedCookies();
    expect(result.map((c) => c.name).sort()).toEqual(['wr_skey', 'wr_vid']);
  });

  it('encryptCookies → decryptCookies 往返还原', async () => {
    const original = [fakeCookie('wr_vid'), fakeCookie('wr_skey', { httpOnly: true })];
    const bundle = await encryptCookies(original);
    expect(bundle.cipher.iv).toBeTruthy();
    expect(bundle.cipher.ciphertext).toBeTruthy();
    expect(bundle.savedAt).toBeGreaterThan(0);
    const restored = await decryptCookies(bundle);
    expect(restored).toEqual(original);
  });

  it('restoreCookies 调用 chrome.cookies.set 批量，且不强制 sameSite=no_restriction', async () => {
    const cookies = [
      fakeCookie('wr_vid', { sameSite: 'lax' }),
      fakeCookie('wr_skey', { sameSite: 'strict' }),
    ];
    await restoreCookies(cookies);
    expect(chromeMock.cookies.set).toHaveBeenCalledTimes(2);
    // mock 的调用参数被推断为空元组，这里显式断言成实际传入的 Cookie 形状
    const calls = chromeMock.cookies.set.mock.calls as unknown as Array<[{ sameSite?: string }]>;
    const firstCall = calls[0]?.[0];
    expect(firstCall?.sameSite).toBe('lax');
  });

  it('encryptLocalStorage / decryptLocalStorage 往返', async () => {
    const data = { 'wr_user': '123', 'wr_theme': 'dark' };
    const cipher = await encryptLocalStorage(data);
    const restored = await decryptLocalStorage(cipher);
    expect(restored).toEqual(data);
  });

  it('restoreCookies 中单个失败不影响其他（批量并行）', async () => {
    chromeMock.cookies.set
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const cookies = [fakeCookie('a'), fakeCookie('b'), fakeCookie('c')];
    await expect(restoreCookies(cookies)).resolves.toBeUndefined();
    expect(chromeMock.cookies.set).toHaveBeenCalledTimes(3);
  });
});
