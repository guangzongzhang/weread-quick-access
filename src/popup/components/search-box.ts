import { escapeHtml } from '@/lib/utils/escape';
import { debounce } from '@/lib/utils/debounce';
import { WEREAD_ENDPOINTS } from '@/lib/api/endpoints';
import { extractReaderIdFromDeepLink } from '@/lib/api/deep-link';

// 搜索 API 端点（微信读书网页版实际使用的端点）
const SEARCH_API_ENDPOINTS = [
  'https://weread.qq.com/web/search/global',
];

interface SearchBook {
  bookInfo: {
    bookId: string;
    deepLink?: string;
    title: string;
    author: string;
    cover: string;
    intro?: string;
  };
  readingCount?: number;
}

/** 搜索结果条目的宽松校验：接口返回结构多变，缺字段时直接跳过而不是渲染出空白项 */
function isValidBook(b: unknown): b is SearchBook {
  if (!b || typeof b !== 'object') return false;
  const info = (b as { bookInfo?: unknown }).bookInfo;
  if (!info || typeof info !== 'object') return false;
  const { bookId, title } = info as { bookId?: unknown; title?: unknown };
  // bookId 可能是 string 或 number（不同接口返回类型不一致），都视为有效
  return (typeof bookId === 'string' || typeof bookId === 'number') && typeof title === 'string';
}

/** 获取搜索结果的跳转 URL：优先使用阅读页 URL */
function getBookUrl(b: SearchBook): string {
  const info = b.bookInfo as { deepLink?: string; bookId?: string | number; bookIdV2?: string };
  // 如果有 deepLink，尝试从中提取阅读页 ID
  if (info.deepLink) {
    const readerId = extractReaderIdFromDeepLink(info.deepLink);
    if (readerId) {
      return `https://weread.qq.com/web/reader/${readerId}`;
    }
    // 如果无法提取 v 参数，直接使用 deepLink（官方分享链接可正常打开）
    return info.deepLink;
  }
  // 没有 deepLink 时，使用 reader 路径（bookDetail/{数字ID} 已返回 404）
  return `https://weread.qq.com/web/reader/${info.bookId}`;
}

/** 搜索框：回车后在 popup 内显示搜索结果，点击跳阅读页 */
export function bindSearchBox(input: HTMLInputElement): void {
  const resultsContainer = document.getElementById('searchResults');
  let isSearching = false;

  // 使用 debounce 防止快速触发
  const doSearch = debounce(async (q: string) => {
    if (!resultsContainer || isSearching) return;

    isSearching = true;
    // 单次搜索最多允许 15s，避免某次请求挂住后 isSearching 永远为 true、搜索框彻底失效
    const guard = setTimeout(() => {
      isSearching = false;
    }, 15000);
    resultsContainer.hidden = false;
    resultsContainer.innerHTML = '<div class="search-loading">搜索中...</div>';

    try {
      let books: SearchBook[] = [];

      // 尝试多个 API 端点
      for (const apiEndpoint of SEARCH_API_ENDPOINTS) {
        try {
          const res = await fetch(`${apiEndpoint}?keyword=${encodeURIComponent(q)}`, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });

          if (res.ok) {
            const data = (await res.json()) as { books?: unknown; result?: unknown };
            console.log(`[popup] 搜索 API 返回:`, data);
            const raw = data.books ?? data.result ?? [];
            // 校验必须是数组，避免接口返回对象时 books.length 为 undefined 导致后续异常
            books = Array.isArray(raw) ? raw.filter(isValidBook) : [];
            console.log(`[popup] 搜索结果数量: ${books.length}`);
            if (books.length > 0) break; // 找到结果就停止
          } else {
            console.warn(`[popup] 搜索 API 状态码: ${res.status}`);
          }
        } catch (e) {
          console.warn(`[popup] 搜索端点 ${apiEndpoint} 失败:`, e);
        }
      }

      // 如果所有 API 都失败，降级为直接跳转
      if (books.length === 0) {
        resultsContainer.innerHTML = `
        <div class="search-empty">API 调用失败，点击跳转到微信读书搜索</div>
        <a class="search-result-item" href="${WEREAD_ENDPOINTS.SEARCH(q)}" target="_blank" rel="noopener">
          <div class="search-result-meta">
            <p class="search-result-title">在微信读书中搜索「${escapeHtml(q)}」</p>
          </div>
        </a>`;
        return;
      }

      const items = books
        .slice(0, 10)
        .map(
          (b) => `
      <div class="search-result-item" data-book-id="${escapeHtml(String(b.bookInfo.bookId ?? ''))}" data-book-title="${escapeHtml(b.bookInfo.title)}" data-book-author="${escapeHtml(b.bookInfo.author ?? '')}">
        <a class="search-result-link" href="${escapeHtml(getBookUrl(b))}" target="_blank" rel="noopener">
          <img class="search-result-cover" src="${escapeHtml(b.bookInfo.cover ?? '')}" alt="" onerror="this.style.visibility='hidden'" />
          <div class="search-result-meta">
            <p class="search-result-title">${escapeHtml(b.bookInfo.title)}</p>
            <p class="search-result-author">${escapeHtml(b.bookInfo.author ?? '')}</p>
            ${b.bookInfo.intro ? `<p class="search-result-intro">${escapeHtml(b.bookInfo.intro.slice(0, 50))}</p>` : ''}
          </div>
        </a>
      </div>`,
        )
        .join('');

      resultsContainer.innerHTML = `<div class="search-results-list">${items}</div>`;
    } finally {
      clearTimeout(guard);
      isSearching = false;
    }
  }, 300);

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;

    doSearch(q);
  });

  // 点击搜索框外关闭结果
  document.addEventListener('click', (e) => {
    if (!resultsContainer) return;
    if (e.target === input || resultsContainer.contains(e.target as Node)) return;
    resultsContainer.hidden = true;
  });
}

