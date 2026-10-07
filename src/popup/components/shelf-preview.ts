import { escapeHtml } from '@/lib/utils/escape';
import { sendBg } from '@/lib/messaging/bridge';
import { MsgType, type ShelfBook } from '@/lib/messaging/types';
import { WEREAD_ENDPOINTS } from '@/lib/api/endpoints';
import { applyI18n } from '@/lib/i18n';

/** 格式化最近阅读时间 */
function formatLastRead(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return '今天读过';
  if (diff < 2 * day) return '昨天读过';
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前读过`;
  return '';
}

/** 格式化阅读时长（秒 → 可读文本） */
function formatReadingTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}小时${m > 0 ? m + '分' : ''}`;
  if (m > 0) return `${m}分钟`;
  return '<1分钟';
}

/** 绑定刷新按钮：点击后显示加载状态并触发刷新 */
function bindRefreshBtn(container: HTMLElement, onRefresh: () => void): void {
  const btn = container.querySelector<HTMLButtonElement>('.shelf-refresh-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = '⏳ 刷新中...';
    btn.classList.add('loading');
    // 延迟调用让加载状态先渲染出来
    setTimeout(() => {
      try {
        onRefresh();
      } finally {
        // onRefresh 会重新渲染整个容器，按钮会被替换；
        // 这里兜底恢复状态（如果容器未被替换）
        btn.disabled = false;
        btn.textContent = '🔄 刷新';
        btn.classList.remove('loading');
      }
    }, 50);
  });
}

/** 渲染最近在读 3 本；API 失败降级为快捷链接 */
export async function renderShelfSection(container: HTMLElement, onRefresh?: () => void): Promise<void> {
  const books = await sendBg<ShelfBook[]>({ type: MsgType.GET_SHELF_PREVIEW }).catch(() => [] as ShelfBook[]);

  // 添加刷新按钮和标题行
  const headerHtml = `
    <div class="shelf-header">
      <p class="shelf-title" data-i18n="shelfTitle">最近在读</p>
      ${onRefresh ? `<button class="shelf-refresh-btn" title="刷新阅读列表">🔄 刷新</button>` : ''}
    </div>`;

  if (books.length === 0) {
    container.innerHTML = `
      ${headerHtml}
      <div class="shelf-empty">
        <a class="shelf-link" href="${WEREAD_ENDPOINTS.SHELF}" target="_blank" rel="noopener" data-i18n="myShelf">我的书架</a>
        <a class="shelf-link" href="${WEREAD_ENDPOINTS.NOTE}" target="_blank" rel="noopener" data-i18n="myNotes">我的笔记</a>
        <a class="shelf-link" href="${WEREAD_ENDPOINTS.HOME}" target="_blank" rel="noopener" data-i18n="explore">发现</a>
      </div>`;

    // 绑定刷新按钮事件
    if (onRefresh) bindRefreshBtn(container, onRefresh);
    // 动态插入的 data-i18n 节点不会自动翻译，需在渲染后统一应用
    applyI18n(container);
    return;
  }

  const items = books
    .map((b) => {
      // 确保进度显示准确：使用 progress 字段（0-1 范围）
      const percent = Math.max(0, Math.min(100, Math.round(b.progress * 100)));
      const lastRead = formatLastRead(b.lastReadTime);
      const readTime = formatReadingTime(b.readingTime ?? 0);
      return `
    <div class="book-item" data-book-id="${escapeHtml(b.bookIdNum || b.bookId)}" data-book-title="${escapeHtml(b.title)}">
      <a class="book-item-link" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">
        <img class="book-cover" src="${escapeHtml(b.cover)}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="book-meta">
          <p class="book-title">${escapeHtml(b.title)}</p>
          <p class="book-author">${escapeHtml(b.author)}</p>
          <div class="book-progress-row">
            <div class="book-progress">
              <div class="book-progress-bar" style="width:${percent}%"></div>
            </div>
            <span class="book-progress-text">${percent}%</span>
          </div>
          <p class="book-extra">
            ${readTime ? `<span class="book-read-time">⏱ ${readTime}</span>` : ''}
            ${lastRead ? `<span class="book-last-read">${lastRead}</span>` : ''}
          </p>
        </div>
      </a>
    </div>`;
    })
    .join('');

  container.innerHTML = `${headerHtml}<div class="book-list">${items}</div>`;

  // 绑定刷新按钮事件
  if (onRefresh) bindRefreshBtn(container, onRefresh);

  // 动态插入的 data-i18n 节点不会自动翻译，需在渲染后统一应用
  applyI18n(container);
}
