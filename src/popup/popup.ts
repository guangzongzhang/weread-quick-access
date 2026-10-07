import { bindSearchBox } from './components/search-box';
import { renderAccountSection } from './components/account-list';
import { renderShelfSection } from './components/shelf-preview';
import { sendBg } from '@/lib/messaging/bridge';
import { MsgType, type AccountBrief, type ShelfBook } from '@/lib/messaging/types';
import { escapeHtml } from '@/lib/utils/escape';
import { applyI18n } from '@/lib/i18n';

const WEREAD_URL = 'https://weread.qq.com/';
let recentBookUrl: string | null = null;

async function init(): Promise<void> {
  const status = document.getElementById('jsStatus');
  if (status) status.textContent = 'JS已执行';

  setupEventListeners();
  applyI18n();

  // 首页内容
  void safeRender('account', () => renderAccountSection(getAccountSection(), refreshHome));
  void safeRender('shelf', () => renderShelfSection(getShelfSection(), refreshHome));
  void safeRender('continue', loadContinueReading);

  // 设置页内容（懒加载，切换到设置 tab 时再加载）
  // 自动登录开关状态在两个 tab 都要加载
  void safeRender('autoLogin', loadAutoLoginSetting);
}

// ---------- Tab 切换 ----------
function setupTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const contents = document.querySelectorAll<HTMLElement>('.tab-content');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      contents.forEach((c) => c.classList.toggle('active', c.id === `tab-${target}`));

      // 切换到设置 tab 时加载看板和账户列表
      if (target === 'settings') {
        void safeRender('shelfBoard', loadShelfBoard);
        void safeRender('accountList', loadAccountList);
      }
    });
  });
}

// ---------- 首页 ----------
async function loadContinueReading(): Promise<void> {
  const book = await sendBg<ShelfBook | null>({ type: MsgType.GET_RECENT_BOOK }).catch(() => null);
  const container = document.getElementById('continueReading');
  if (!container) return;

  if (!book) {
    container.hidden = true;
    return;
  }

  recentBookUrl = book.url;
  const cover = document.getElementById('continueCover') as HTMLImageElement | null;
  const title = document.getElementById('continueTitle');
  const author = document.getElementById('continueAuthor');
  const meta = document.getElementById('continueMeta');

  if (cover) cover.src = book.cover;
  if (title) title.textContent = book.title;
  if (author) author.textContent = book.author;
  if (meta) {
    const percent = Math.round(book.progress * 100);
    const h = book.readingTime ? Math.floor(book.readingTime / 3600) : 0;
    const m = book.readingTime ? Math.floor((book.readingTime % 3600) / 60) : 0;
    const timeStr = h > 0 ? `${h}小时${m > 0 ? m + '分' : ''}` : m > 0 ? `${m}分钟` : '';
    meta.textContent = timeStr ? `进度 ${percent}% · 已读 ${timeStr}` : `进度 ${percent}%`;
  }
  container.hidden = false;
}

function refreshHome(): void {
  void safeRender('account', () => renderAccountSection(getAccountSection(), refreshHome));
  void safeRender('shelf', () => renderShelfSection(getShelfSection(), refreshHome));
  void safeRender('continue', loadContinueReading);
}

async function loadAutoLoginSetting(): Promise<void> {
  const autoLogin = await sendBg<boolean>({ type: MsgType.GET_AUTO_LOGIN });
  const el = document.getElementById('autoLoginSwitch') as HTMLInputElement | null;
  if (el) el.checked = autoLogin;
}

function getAccountSection(): HTMLElement {
  return document.getElementById('accountSection')!;
}

function getShelfSection(): HTMLElement {
  return document.getElementById('shelfSection')!;
}

// ---------- 设置页：阅读看板 ----------
async function loadShelfBoard(): Promise<void> {
  const board = document.getElementById('shelfBoard');
  if (!board) return;
  board.innerHTML = '<div class="empty-state">加载中...</div>';
  try {
    const books = await sendBg<ShelfBook[]>({ type: MsgType.GET_ALL_SHELF });
    renderShelfBoard(books);
  } catch {
    board.innerHTML = '<div class="empty-state">⚠️ 书架加载失败，请确认已登录微信读书</div>';
  }
}

function renderShelfBoard(books: ShelfBook[]): void {
  const total = books.length;
  const reading = books.filter((b) => b.progress < 1).length;
  const finished = books.filter((b) => b.progress >= 1).length;
  (document.getElementById('statTotal') as HTMLElement).textContent = String(total);
  (document.getElementById('statReading') as HTMLElement).textContent = String(reading);
  (document.getElementById('statFinished') as HTMLElement).textContent = String(finished);

  const board = document.getElementById('shelfBoard')!;
  if (total === 0) {
    board.innerHTML = '<div class="empty-state">书架为空</div>';
    return;
  }

  const readingBooks = books.filter((b) => b.progress > 0 && b.progress < 1);
  const unread = books.filter((b) => b.progress === 0);
  const finishedBooks = books.filter((b) => b.progress >= 1);
  const sorted = [...readingBooks, ...unread, ...finishedBooks].slice(0, 30);

  board.innerHTML = `
    <div class="shelf-grid-mini">
      ${sorted
        .map(
          (b) => `
        <a class="book-card-mini" href="${escapeHtml(getBookLink(b))}" target="_blank">
          <img class="book-cover-mini" src="${escapeHtml(b.cover || '')}" alt="" onerror="this.style.visibility='hidden'" />
          <div class="book-info-mini">
            <div class="book-title-mini" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</div>
            <div class="book-progress-mini">
              <div class="book-progress-fill-mini" style="width:${Math.round(b.progress * 100)}%"></div>
            </div>
          </div>
        </a>`,
        )
        .join('')}
    </div>`;
}

function getBookLink(b: ShelfBook): string {
  // 使用书架数据中已校正的阅读页 URL（/web/reader/{24位ID}）
  // bookDetail/{数字ID} 已返回 404，不再使用
  return b.url || `https://weread.qq.com/web/reader/${b.bookId}`;
}

// ---------- 设置页：账户管理 ----------
async function loadAccountList(): Promise<void> {
  const list = await sendBg<AccountBrief[]>({ type: MsgType.LIST_ACCOUNTS });
  const container = document.getElementById('accountList')!;
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无账户，请在 weread 页面保存账户</div>';
    return;
  }
  container.innerHTML = list
    .map(
      (a) => `
      <div class="account-row-mini${a.isActive ? ' active' : ''}" data-id="${escapeHtml(a.id)}">
        <div class="account-row-meta-mini">
          <div class="account-row-name">${escapeHtml(a.name)}</div>
          <div class="account-row-sub">${a.isActive ? '当前账户' : 'ID: ' + escapeHtml(a.id)}</div>
        </div>
        <div class="account-row-actions-mini">
          ${a.isActive ? '' : `<button class="btn-mini js-activate" data-id="${escapeHtml(a.id)}">切换</button>`}
          <button class="btn-mini js-remove" data-id="${escapeHtml(a.id)}">删除</button>
        </div>
      </div>`,
    )
    .join('');

  container.querySelectorAll<HTMLElement>('.js-activate').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!id) return;
      await sendBg({ type: MsgType.SET_ACTIVE, payload: { id } });
      showToast('已切换账户');
      await loadAccountList();
      refreshHome();
    });
  });
  container.querySelectorAll<HTMLElement>('.js-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!id) return;
      if (!confirm('确定删除此账户？')) return;
      await sendBg({ type: MsgType.REMOVE_ACCOUNT, payload: { id } });
      showToast('已删除账户');
      await loadAccountList();
      refreshHome();
    });
  });
}

// ---------- 事件绑定 ----------
function setupEventListeners(): void {
  setupTabs();

  document.getElementById('openBtn')?.addEventListener('click', openWeRead);
  document.getElementById('saveBtn')?.addEventListener('click', saveCurrentAccount);
  document.getElementById('continueBtn')?.addEventListener('click', continueReading);
  document.getElementById('autoLoginSwitch')?.addEventListener('change', toggleAutoLogin);
  document.getElementById('refreshShelfBtn')?.addEventListener('click', () => void loadShelfBoard());
  document.getElementById('clearAllBtn')?.addEventListener('click', clearAllAccounts);

  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  if (searchInput) bindSearchBox(searchInput);
}

async function continueReading(): Promise<void> {
  if (recentBookUrl) {
    await chrome.tabs.create({ url: recentBookUrl });
    window.close();
  } else {
    await chrome.tabs.create({ url: WEREAD_URL });
    window.close();
  }
}

async function openWeRead(): Promise<void> {
  try {
    await chrome.tabs.create({ url: WEREAD_URL });
    window.close();
  } catch (e) {
    showToast(`打开失败: ${(e as Error).message}`);
  }
}

async function saveCurrentAccount(): Promise<void> {
  try {
    await sendBg({ type: MsgType.SAVE_CURRENT });
    showToast('账户信息已保存');
    refreshHome();
  } catch (e) {
    showToast(`保存失败: ${(e as Error).message}`);
  }
}

async function toggleAutoLogin(e: Event): Promise<void> {
  const checked = (e.target as HTMLInputElement).checked;
  await sendBg({ type: MsgType.SET_AUTO_LOGIN, payload: { autoLogin: checked } });
  showToast(checked ? '已开启自动登录' : '已关闭自动登录');
}

async function clearAllAccounts(): Promise<void> {
  if (!confirm('确定要清除全部账户吗？此操作不可恢复。')) return;
  await sendBg({ type: MsgType.CLEAR_ALL });
  showToast('已清除全部账户');
  await loadAccountList();
  refreshHome();
}

// ---------- 工具 ----------
function safeRender(name: string, fn: () => Promise<unknown>): void {
  let promise: Promise<unknown>;
  try {
    promise = fn();
  } catch (e) {
    promise = Promise.reject(e);
  }
  promise.catch((e) => {
    console.warn(`[popup] ${name} 渲染失败:`, e);
  });
}

function showToast(msg: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 2000);
}

document.addEventListener('DOMContentLoaded', init);
