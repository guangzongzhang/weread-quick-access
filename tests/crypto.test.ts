import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMock } from './setup';
import { encryptString, decryptString, getOrCreateKey, exportKey, importKey, generateKey } from '../src/lib/auth/crypto';

describe('crypto', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('加密-解密往返应还原原文', async () => {
    const key = await getOrCreateKey();
    const plaintext = 'hello weread 📚 skey=abc123&vid=xyz';
    const cipher = await encryptString(plaintext, key);
    expect(cipher.iv).not.toBe('');
    expect(cipher.ciphertext).not.toBe(plaintext);
    const decrypted = await decryptString(cipher, key);
    expect(decrypted).toBe(plaintext);
  });

  it('相同明文每次加密应生成不同 IV/密文', async () => {
    const key = await getOrCreateKey();
    const a = await encryptString('same', key);
    const b = await encryptString('same', key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('getOrCreateKey 首次生成并持久化，二次读取复用', async () => {
    const k1 = await getOrCreateKey();
    const k2 = await getOrCreateKey();
    // 应是相同密钥（从 storage 反序列化），加密-解密互通
    const cipher = await encryptString('test', k1);
    const plain = await decryptString(cipher, k2);
    expect(plain).toBe('test');
  });

  it('导出再导入的密钥可解密原密文', async () => {
    const key = await getOrCreateKey();
    const cipher = await encryptString('data', key);
    const jwk = await exportKey(key);
    const imported = await importKey(jwk);
    const plain = await decryptString(cipher, imported);
    expect(plain).toBe('data');
  });

  it('独立生成的两个密钥不能互相解密', async () => {
    const k1 = await generateKey();
    const k2 = await generateKey();
    const cipher = await encryptString('secret', k1);
    await expect(decryptString(cipher, k2)).rejects.toThrow();
  });
});
