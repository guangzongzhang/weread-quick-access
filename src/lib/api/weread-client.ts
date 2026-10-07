/**
 * 微信读书 Web API 客户端
 *
 * 防御性实现：weread 网页版接口响应结构多变（books 数组、{books:{datalist}} 嵌套、
 * 按 categoryId 分组等），这里做宽松提取，失败时抛错由调用方降级。
 */

import type { ShelfBook } from '@/lib/messaging/types';
import { WEREAD_ENDPOINTS } from './endpoints';
import { extractReaderIdFromDeepLink, isReaderId } from './deep-link';

/** 书架响应的常见结构变体
 *  - booksV2.datalist：书架上的书籍（用户主动加入的）
 *  - categories[].books：按分类组织的书籍
 *  - books：所有阅读过的内容（含公众号，需过滤）
 */
interface ShelfSyncResponse {
  books?: RawBook[];
  booksV2?: { datalist?: RawBook[] };
  categories?: Array<{ books: RawBook[] }>;
  bookProgress?: Array<{ bookId: string; progress: number; updateTime?: number; readingTime?: number }>;
}

interface RawBook {
  bookId?: string;
  bookIdV2?: string;
  title?: string;
  author?: string;
  cover?: string;
  readProgress?: number;
  progress?: number;
  readingProgress?: number;
  readPercent?: number;
  percent?: number;
  finished?: number;
  updateTime?: number;
  lastReadTime?: number;
  readUpdateTime?: number;
  finishedDate?: number;
  deepLink?: string;
}

/** infoById API 返回结构 */
interface BookInfoResponse {
  bookId?: string;       // 24 位 hex，用于阅读页 URL
  title?: string;
  author?: string;
  cover?: string;
}

/** 归一化进度值：API 可能返回 0-1 比例或 0-100 百分比，统一为 0-1 */
function normalizeProgress(val: number): number {
  if (val > 1) return Math.min(1, val / 100);
  return Math.max(0, Math.min(1, val));
}

const enumToProgress = (b: RawBook, progressMap?: Map<string, number>): number => {
  // 优先从 bookProgress 映射表获取真实阅读进度（百分比 0-100）
  if (progressMap && b.bookId) {
    const p = progressMap.get(String(b.bookId));
    if (typeof p === 'number') return normalizeProgress(p);
  }
  // 兜底：booksV2.datalist / books 自带的进度字段（通常不存在）
  const candidates = [b.readProgress, b.progress, b.readingProgress, b.readPercent, b.percent];
  for (const val of candidates) {
    if (typeof val === 'number') return normalizeProgress(val);
  }
  // 注意：finished 是书架分类标记（已读完书架），不是阅读进度，不再用于推算进度
  return 0;
};

const enumToLastReadTime = (b: RawBook): number => {
  // 优先级：lastReadTime > readUpdateTime > updateTime > finishedDate
  // lastReadTime / readUpdateTime 是真正的最后阅读时间
  if (typeof b.lastReadTime === 'number' && b.lastReadTime > 0) return b.lastReadTime;
  if (typeof b.readUpdateTime === 'number' && b.readUpdateTime > 0) return b.readUpdateTime;
  if (typeof b.updateTime === 'number' && b.updateTime > 0) return b.updateTime;
  if (typeof b.finishedDate === 'number' && b.finishedDate > 0) return b.finishedDate;
  return 0;
};

const normalize = (b: RawBook, progressMap?: Map<string, number>, readingTimeMap?: Map<string, number>): ShelfBook | null => {
  if (!b.title) return null;
  const author = b.author ?? '';
  
  // 过滤公众号：author 含「公众号」或 title 含「公众号」
  if (author.includes('公众号') || b.title.includes('公众号')) return null;
  
  // bookId 是数字 ID，bookIdV2 可能是 24 位 hex 或其他格式
  // 优先从 deepLink 提取阅读页 ID（最可靠），其次用 bookIdV2，最后用数字 ID
  const bookIdV2 = b.bookIdV2 != null ? String(b.bookIdV2) : '';
  const bookIdNum = b.bookId != null ? String(b.bookId) : '';
  if (!bookIdV2 && !bookIdNum) return null;

  // 优先从 deepLink 提取 24 位阅读页 ID
  let readerId = '';
  if (b.deepLink) {
    readerId = extractReaderIdFromDeepLink(b.deepLink) ?? '';
  }
  // 如果 deepLink 没有，且 bookIdV2 是合法阅读页 ID，直接用
  if (!readerId && bookIdV2 && isReaderId(bookIdV2)) {
    readerId = bookIdV2;
  }

  const lastReadTime = enumToLastReadTime(b);

  const readingTime = readingTimeMap?.get(bookIdNum) ?? undefined;

  return {
    bookId: readerId || bookIdV2 || bookIdNum,
    bookIdNum,
    title: b.title,
    author,
    cover: b.cover ?? '',
    progress: enumToProgress(b, progressMap),
    lastReadTime,
    readingTime,
    url: WEREAD_ENDPOINTS.BOOK_READER(readerId || bookIdV2 || bookIdNum),
  };
};

/** 用数字 bookId 调用 /book/info API，从 deepLink 中提取阅读页 ID */
async function getBookReaderId(bookIdNum: string): Promise<string | null> {
  if (!bookIdNum) return null;
  try {
    const url = `https://weread.qq.com/web/book/info?bookId=${bookIdNum}`;
    const data = (await getJson(url)) as BookInfoResponse & Record<string, unknown>;
    const deepLink = (data.deepLink ?? data.deepUrl) as string | undefined;
    console.log(`[weread] getBookReaderId bookId=${bookIdNum} deepLink=${deepLink}`);
    if (deepLink) {
      const v = extractReaderIdFromDeepLink(deepLink);
      console.log(`[weread] getBookReaderId 提取到 v=${v}`);
      if (v) return v;
    }
    // 兜底：检查 bookId 字段是否是阅读页 ID
    const id = (data.bookId ?? data.bookid) as string | undefined;
    if (id && isReaderId(id)) return id;
    console.warn(`[weread] getBookReaderId 未能提取阅读页 ID bookId=${bookIdNum}`, data);
    return null;
  } catch (e) {
    console.warn(`[weread] getBookReaderId 异常 bookId=${bookIdNum}`, e);
    return null;
  }
}

/** 校正书架书籍的阅读页 URL：用数字 ID 获取正确的阅读页 ID */
export async function enrichBookUrl(book: ShelfBook): Promise<ShelfBook> {
  console.log(`[weread] enrichBookUrl: title=${book.title}, bookId=${book.bookId}, bookIdNum=${book.bookIdNum}`);
  if (!book.bookIdNum) {
    console.warn(`[weread] enrichBookUrl 跳过：无 bookIdNum，title=${book.title}`);
    return book;
  }
  // 如果 bookId 已经是阅读页 ID，直接用
  if (isReaderId(book.bookId)) {
    console.log(`[weread] enrichBookUrl：bookId 已是阅读页 ID，直接用`);
    return book;
  }
  const realId = await getBookReaderId(book.bookIdNum);
  if (realId) {
    console.log(`[weread] enrichBookUrl 成功：${book.title} → ${realId}`);
    return { ...book, bookId: realId, url: WEREAD_ENDPOINTS.BOOK_READER(realId) };
  }
  console.warn(`[weread] enrichBookUrl 失败：${book.title} bookIdNum=${book.bookIdNum}，保留原 URL`);
  return book;
}

/** 从 chrome.cookies API 获取目标 URL 的 Cookie 字符串 */
async function getCookieHeader(url: string): Promise<string> {
  const cookies = await chrome.cookies.getAll({ url });
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function getJson(url: string): Promise<unknown> {
  const cookieHeader = await getCookieHeader(url);
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`weread API ${url} 失败: ${res.status}`);
  }
  return res.json();
}

/** 取书架所有书（按最近阅读时间降序）
 *  优化策略：
 *  1. 优先使用 booksV2.datalist（用户主动添加到书架的书）
 *  2. 合并 categories 中的书籍（分类组织）
 *  3. 过滤掉重复项（基于 bookIdV2 或 bookId）
 *  4. 按最后阅读时间排序
 */
export async function getAllShelfBooks(): Promise<ShelfBook[]> {
  const data = (await getJson(WEREAD_ENDPOINTS.SHELF_SYNC)) as ShelfSyncResponse;

  // 合并所有数据源，优先使用 booksV2.datalist
  const rawBooks: RawBook[] = [
    ...(data.booksV2?.datalist ?? []),
    ...(data.categories?.flatMap((c) => c.books) ?? []),
    ...(data.books ?? []),
  ];

  // 从 bookProgress 构建阅读进度和时长映射表（bookId → progress / readingTime）
  // bookProgress 是书架同步 API 返回的独立进度数组，booksV2.datalist 本身不含进度
  const progressMap = new Map<string, number>();
  const readingTimeMap = new Map<string, number>();
  for (const p of data.bookProgress ?? []) {
    if (p.bookId && typeof p.progress === 'number') {
      progressMap.set(String(p.bookId), p.progress);
    }
    if (p.bookId && typeof p.readingTime === 'number') {
      readingTimeMap.set(String(p.bookId), p.readingTime);
    }
  }

  // 去重：同一本书在不同数据源里可能只带数字 ID 或只带 bookIdV2，
  // 若只按单一键去重，会在书架上出现重复条目。这里两个键都建立索引并合并字段。
  const seenIds = new Map<string, RawBook>();
  for (const b of rawBooks) {
    if (!b.title) continue;
    const numId = b.bookId ?? '';
    const v2Id = b.bookIdV2 ?? '';
    if (!numId && !v2Id) continue;

    const existing = (numId ? seenIds.get(numId) : undefined) ?? (v2Id ? seenIds.get(v2Id) : undefined);

    if (existing) {
      // 合并：补齐缺失字段，优先保留更完整的信息
      if (b.bookIdV2 && !existing.bookIdV2) existing.bookIdV2 = b.bookIdV2;
      if (b.cover && !existing.cover) existing.cover = b.cover;
      if (b.author && !existing.author) existing.author = b.author;
      if (typeof b.readProgress === 'number' && typeof existing.readProgress !== 'number') {
        existing.readProgress = b.readProgress;
      }
      if (typeof b.lastReadTime === 'number' && !existing.lastReadTime) {
        existing.lastReadTime = b.lastReadTime;
      }
      if (typeof b.readUpdateTime === 'number' && !existing.readUpdateTime) {
        existing.readUpdateTime = b.readUpdateTime;
      }
      if (typeof b.finishedDate === 'number' && !existing.finishedDate) {
        existing.finishedDate = b.finishedDate;
      }
      if (numId) seenIds.set(numId, existing);
      if (v2Id) seenIds.set(v2Id, existing);
      continue;
    }

    // 两个 ID 都指向同一条记录，避免同一本书被计两次
    if (numId) seenIds.set(numId, b);
    if (v2Id) seenIds.set(v2Id, b);
  }

  const uniqueBooks = Array.from(new Set(seenIds.values()));

  // 归一化并保留原始索引，用于稳定排序
  const result = uniqueBooks
    .map((book, index) => ({ book: normalize(book, progressMap, readingTimeMap), index }))
    .filter((x): x is { book: ShelfBook; index: number } => x.book !== null)
    .sort((a, b) => {
      // 按最后阅读时间降序排序（最新的在前）
      const timeA = a.book.lastReadTime || 0;
      const timeB = b.book.lastReadTime || 0;
      if (timeB !== timeA) return timeB - timeA;
      // 时间相同时保持书架原始顺序（稳定排序）
      return a.index - b.index;
    })
    .map((x) => x.book);

  if (result.length === 0) {
    console.warn('[weread] 书架为空', {
      booksV2Count: data.booksV2?.datalist?.length ?? 0,
      categoriesCount: data.categories?.length ?? 0,
      booksCount: data.books?.length ?? 0,
      sampleKeys: data.books?.[0] ? Object.keys(data.books[0]) : [],
    });
  }

  // 注意：不在此处调用 enrichBookUrl，避免对大量书籍并发 API 调用导致超时
  // 由 getShelfPreview / getRecentBook 按需对少量书籍调用
  return result;
}

/** 取最近在读 3 本用于弹窗预览 */
export async function getShelfPreview(): Promise<ShelfBook[]> {
  const books = await getAllShelfBooks();
  const preview = books.slice(0, 3);
  // 校正每本书的阅读页 URL
  return Promise.all(preview.map(enrichBookUrl));
}

/** 取最近阅读的一本书（用于一键续读） */
export async function getRecentBook(): Promise<ShelfBook | null> {
  const books = await getAllShelfBooks();
  // 取最近阅读且未读完的书；若都读完了则取最近阅读的
  const unfinished = books.filter((b) => b.progress < 1);
  const book = unfinished[0] ?? books[0] ?? null;
  if (!book) return null;
  return enrichBookUrl(book);
}
