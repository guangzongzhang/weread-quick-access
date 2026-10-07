/**
 * AES-GCM 加密封装（Web Crypto API）
 *
 * 密钥与密文均存于 chrome.storage.local。
 * MV3 沙箱内每个扩展的 storage 互相隔离，其他扩展无法直接读取。
 * 风险：本机磁盘 LevelDB 可被同机其他原生进程读取，但已是 MV3 现实约束下较好的折中。
 * 进阶：未来可接入 chrome.storage.session + 用户解锁密码派生密钥方案。
 */

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const STORAGE_KEY = '__crypto_key_v1__';

/** 首次生成密钥的在途 Promise（并发保护，见 getOrCreateKey） */
let keyPromise: Promise<CryptoKey> | null = null;

export interface CipherPayload {
  /** base64 编码的 IV */
  iv: string;
  /** base64 编码的密文 */
  ciphertext: string;
}

export type StoredKey = JsonWebKey;

function base64Encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64Decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  // 显式基于 ArrayBuffer 构造并标注为 Uint8Array<ArrayBuffer>：
  // 默认泛型 Uint8Array<ArrayBufferLike> 含 SharedArrayBuffer，无法作为 BufferSource 传给 Web Crypto
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGO, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportKey(key: CryptoKey): Promise<StoredKey> {
  return (await crypto.subtle.exportKey('jwk', key)) as StoredKey;
}

export async function importKey(jwk: StoredKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: ALGO }, true, ['encrypt', 'decrypt']);
}

/** 获取或创建持久化密钥 */
export async function getOrCreateKey(): Promise<CryptoKey> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as StoredKey | undefined;
  if (stored) {
    try {
      return await importKey(stored);
    } catch (e) {
      console.warn('[crypto] 密钥导入失败，重新生成', e);
    }
  }
  // 并发保护：首次使用时 encryptCookies / encryptLocalStorage 可能同时调用本函数，
  // 若各自生成一把密钥，先写入的那份密文就会被后写入的密钥「顶掉」而永久无法解密。
  // 这里用模块级在途 Promise，保证一次会话内只生成一把密钥。
  if (!keyPromise) {
    keyPromise = createAndPersistKey().finally(() => {
      keyPromise = null;
    });
  }
  return keyPromise;
}

async function createAndPersistKey(): Promise<CryptoKey> {
  const key = await generateKey();
  const jwk = await exportKey(key);
  await chrome.storage.local.set({ [STORAGE_KEY]: jwk });
  return key;
}

export async function encryptString(plaintext: string, key: CryptoKey): Promise<CipherPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: ALGO, iv }, key, data);
  return { iv: base64Encode(iv), ciphertext: base64Encode(cipherBuf) };
}

export async function decryptString(payload: CipherPayload, key: CryptoKey): Promise<string> {
  const iv = base64Decode(payload.iv);
  const cipher = base64Decode(payload.ciphertext);
  const plainBuf = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}
