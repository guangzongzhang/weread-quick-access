/**
 * deepLink 解析：从微信读书分享/接口返回的 deepLink 中提取阅读页 ID（v 参数）。
 *
 * 该逻辑原先在 weread-client 与 popup/search-box 中各写了一份，两份容易改漏，
 * 统一收敛到这里。阅读页 ID 是 24 位字符（hex + g，如 cce32bd0813ab862bg019594）。
 */

/** 阅读页 ID 形如 24 位字符（hex + g，如 cce32bd0813ab862bg019594） */
const READER_ID_RE = /^[a-f0-9g]{20,}$/i;

/** 从任意 URL / query 串中提取阅读页 ID（v 或 w 参数）；解析失败时用正则兜底（兼容 &amp; 转义） */
export function extractReaderIdFromDeepLink(deepLink: string): string | null {
  try {
    const url = new URL(deepLink);
    const v = url.searchParams.get('v');
    if (v && READER_ID_RE.test(v)) return v;
    const w = url.searchParams.get('w');
    if (w && READER_ID_RE.test(w)) return w;
  } catch {
    // 不是合法 URL，走正则兜底
  }
  const match = deepLink.match(/[?&](?:amp;)?[vw]=([a-f0-9g]{20,})(?:&|$)/i);
  return match ? match[1] : null;
}

/** 判断一个 bookId 是否已经是阅读页 ID（而非数字 ID） */
export function isReaderId(id: string): boolean {
  return READER_ID_RE.test(id);
}
