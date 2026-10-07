/**
 * Cookie 存取：白名单 + 域限制 + AES-GCM 加密
 *
 * 修复：
 * - 不再用 .qq.com 全量 dump（缩小到 weread.qq.com）
 * - 限定白名单字段
 * - 加密后存储
 * - 批量 Promise.all（修复原串行 await）
 * - sameSite 不强制 no_restriction，按原值还原
 */

import { type CipherPayload, decryptString, encryptString, getOrCreateKey } from './crypto';

const WEREAD_DOMAIN = 'weread.qq.com';

/** Cookie 白名单（实施时以实际抓包为准，可调整） */
const COOKIE_WHITELIST = new Set<string>([
  'wr_vid',
  'wr_skey',
  'wr_rt',
  'wr_local_session',
  'wr_pf',
  'wr_appver',
  'wr_autologin',
]);

export interface SerializedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  expirationDate?: number;
}

export interface EncryptedCookieBundle {
  cipher: CipherPayload;
  savedAt: number;
}

/** 读取当前 weread 域下白名单 Cookie */
export async function captureWhitelistedCookies(): Promise<SerializedCookie[]> {
  const all = await chrome.cookies.getAll({ domain: WEREAD_DOMAIN });
  return all
    .filter((c) => COOKIE_WHITELIST.has(c.name))
    .filter((c) => c.domain.includes(WEREAD_DOMAIN))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? '/',
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite ?? 'unspecified',
      expirationDate: c.expirationDate,
    }));
}

export async function encryptCookies(
  cookies: SerializedCookie[],
): Promise<EncryptedCookieBundle> {
  const key = await getOrCreateKey();
  const cipher = await encryptString(JSON.stringify(cookies), key);
  return { cipher, savedAt: Date.now() };
}

export async function decryptCookies(
  bundle: EncryptedCookieBundle,
): Promise<SerializedCookie[]> {
  const key = await getOrCreateKey();
  const json = await decryptString(bundle.cipher, key);
  return JSON.parse(json) as SerializedCookie[];
}

const SAME_SITE_MAP: Record<string, chrome.cookies.SameSiteStatus> = {
  no_restriction: 'no_restriction',
  lax: 'lax',
  strict: 'strict',
  unspecified: 'unspecified',
};

/** 批量还原 Cookie（修复原 [background.js:25-40] 串行 await） */
export async function restoreCookies(cookies: SerializedCookie[]): Promise<void> {
  await Promise.all(
    cookies.map(async (c) => {
      try {
        await chrome.cookies.set({
          url: `https://${WEREAD_DOMAIN}`,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: SAME_SITE_MAP[c.sameSite] ?? 'unspecified',
          expirationDate: c.expirationDate,
        });
      } catch (e) {
        console.warn(`[cookie-store] 还原 ${c.name} 失败`, e);
      }
    }),
  );
}

export async function encryptLocalStorage(
  data: Record<string, string>,
): Promise<CipherPayload> {
  const key = await getOrCreateKey();
  return encryptString(JSON.stringify(data), key);
}

export async function decryptLocalStorage(
  cipher: CipherPayload,
): Promise<Record<string, string>> {
  const key = await getOrCreateKey();
  const json = await decryptString(cipher, key);
  return JSON.parse(json) as Record<string, string>;
}
