import { escapeHtml } from '@/lib/utils/escape';
import { sendBg } from '@/lib/messaging/bridge';
import { MsgType, type AccountBrief, type ShelfBook } from '@/lib/messaging/types';
import { applyI18n } from '@/lib/i18n';

async function init(): Promise<void> {
  applyI18n();
  await Promise.all([loadAccounts(), loadAutoLogin(), loadShelfBoard()]);
  setupEventListeners();
}

// ---------- 阅读看板 ----------
async function loadShelfBoard(): Promise<void> {
  const board = document.getElementById('shelfBoard')!;
  board.innerHTML = '<div class="empty-state">加载中...</div>';
  try {
    const books = await sendBg<ShelfBook[]>({ type: MsgType.GET_ALL_SHELF });
    renderShelfBoard(books);
  } catch (e) {
    board.innerHTML = '<div class="empty-state">⚠️ 书架加载失败，请确认已在浏览器登录微信读书</div>';
  }
}

function renderShelfBoard(books: ShelfBook[]): void {
  // 更新统计
  const total = books.length;
  const reading = books.filter((b) => b.progress < 1).length;
  const finished = books.filter((b) => b.progress >= 1).length;
  (document.getElementById('statTotal') as HTMLElement).textContent = String(total);
  (document.getElementById('statReading') as HTMLElement).textContent = String(reading);
  (document.getElementById('statFinished') as HTMLElement).textContent = String(finished);

  const board = document.getElementById('shelfBoard')!;
  if (total === 0) {
    board.innerHTML = '<div class="empty-state">书架为空，请先在微信读书添加书籍</div>';
    return;
  }

  // 按状态分组：正在阅读 → 未开始 → 已读完
  const readingBooks = books.filter((b) => b.progress > 0 && b.progress < 1);
  const unread = books.filter((b) => b.progress === 0);
  const finishedBooks = books.filter((b) => b.progress >= 1);
  const sorted = [...readingBooks, ...unread, ...finishedBooks];

  board.innerHTML = `
    <div class="shelf-grid">
      ${sorted
        .map(
          (b) => `
        <a class="book-card" href="${escapeHtml(getBookLink(b))}" target="_blank">
          <img class="book-cover" src="${escapeHtml(b.cover || '')}" alt="${escapeHtml(b.title)}" onerror="this.style.visibility='hidden'" />
          <div class="book-info">
            <div class="book-title" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</div>
            <div class="book-author">${escapeHtml(b.author || '未知作者')}</div>
            <div class="book-progress-bar">
              <div class="book-progress-fill" style="width:${Math.round(b.progress * 100)}%"></div>
            </div>
            <div class="book-meta">
              <span>${Math.round(b.progress * 100)}%</span>
              <span>${formatLastRead(b.lastReadTime)}</span>
            </div>
          </div>
        </a>`,
        )
        .join('')}
    </div>`;
}

/** 获取书籍链接：使用书架数据中已校正的阅读页 URL（/web/reader/{24位ID}） */
function getBookLink(b: ShelfBook): string {
  return b.url || `https://weread.qq.com/web/reader/${b.bookId}`;
}

function formatLastRead(ts: number): string {
  if (!ts) return '未读';
  const now = Date.now();
  const diff = now - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return '今天读过';
  if (diff < 2 * day) return '昨天读过';
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前读过`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}读过`;
}

async function loadAccounts(): Promise<void> {
  const list = await sendBg<AccountBrief[]>({ type: MsgType.LIST_ACCOUNTS });
  const container = document.getElementById('accountList')!;
  if (list.length === 0) {
    container.innerHTML = '<div class="account-row" style="text-align:center;color:var(--color-text-muted)">暂无账户，请在 weread 页面打开扩展弹窗保存账户</div>';
    return;
  }
  container.innerHTML = list
    .map(
      (a) => `
      <div class="account-row${a.isActive ? ' active' : ''}" data-id="${escapeHtml(a.id)}">
        <div class="account-row-meta">
          <div class="account-row-name" data-mode="view">${escapeHtml(a.name)}</div>
          <div class="account-row-sub">ID: ${escapeHtml(a.id)} · 创建于 ${formatTime(a.createdAt)}</div>
        </div>
        <div class="account-row-actions">
          ${a.isActive ? '<button class="btn-mini" disabled>当前</button>' : `<button class="btn-mini js-activate" data-id="${escapeHtml(a.id)}">设为当前</button>`}
          <button class="btn-mini js-rename" data-id="${escapeHtml(a.id)}">重命名</button>
          <button class="btn-mini danger js-remove" data-id="${escapeHtml(a.id)}">删除</button>
        </div>
      </div>`,
    )
    .join('');

  bindAccountEvents();
}

function bindAccountEvents(): void {
  document.querySelectorAll<HTMLElement>('.js-activate').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!id) return;
      await sendBg({ type: MsgType.SET_ACTIVE, payload: { id } });
      await loadAccounts();
    });
  });
  document.querySelectorAll<HTMLElement>('.js-rename').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest<HTMLElement>('.account-row');
      if (!row) return;
      const id = btn.dataset.id;
      const meta = row.querySelector<HTMLElement>('.account-row-meta')!;
      const nameEl = meta.querySelector<HTMLElement>('[data-mode]')!;
      const old = nameEl.textContent ?? '';
      meta.innerHTML = `
        <input type="text" class="rename-input" value="${escapeHtml(old)}" />
        <div class="account-row-actions">
          <button class="btn-mini js-rename-confirm" data-id="${escapeHtml(id ?? '')}">确定</button>
          <button class="btn-mini js-rename-cancel">取消</button>
        </div>`;
      const input = meta.querySelector<HTMLInputElement>('.rename-input')!;
      input.focus();
      input.select();
      meta.querySelector('.js-rename-confirm')?.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) return;
        await sendBg({ type: MsgType.RENAME_ACCOUNT, payload: { id, name } });
        await loadAccounts();
      });
      meta.querySelector('.js-rename-cancel')?.addEventListener('click', loadAccounts);
    });
  });
  document.querySelectorAll<HTMLElement>('.js-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!id) return;
      if (!confirm('确定删除此账户？')) return;
      await sendBg({ type: MsgType.REMOVE_ACCOUNT, payload: { id } });
      await loadAccounts();
    });
  });
}

async function loadAutoLogin(): Promise<void> {
  const autoLogin = await sendBg<boolean>({ type: MsgType.GET_AUTO_LOGIN });
  const el = document.getElementById('autoLoginSwitch') as HTMLInputElement | null;
  if (el) el.checked = autoLogin;
}

function setupEventListeners(): void {
  document.getElementById('autoLoginSwitch')?.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    await sendBg({ type: MsgType.SET_AUTO_LOGIN, payload: { autoLogin: checked } });
  });
  document.getElementById('clearAllBtn')?.addEventListener('click', async () => {
    if (!confirm('确定清除全部账户？此操作不可恢复。')) return;
    await sendBg({ type: MsgType.CLEAR_ALL });
    await loadAccounts();
  });
  document.getElementById('refreshShelfBtn')?.addEventListener('click', loadShelfBoard);
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

document.addEventListener('DOMContentLoaded', init);
