/**
 * 阅读页增强 content script
 *
 * 功能：
 * 1. 解除右键限制（允许复制/查看上下文菜单）
 */

// 阅读页 bookId 正则：24 位 hex + g，或其他格式
const READER_ID_RE = /\/web\/reader\/([a-f0-9g]{20,})/i;

/** 从当前 URL 提取阅读页 bookId */
function getBookIdFromUrl(): string | null {
  const match = location.pathname.match(READER_ID_RE);
  return match ? match[1] : null;
}

// ---------- 1. 解除右键限制 ----------

function unlockRightClick(): void {
  // 移除页面上所有 contextmenu 的 preventDefault 监听
  // 通过在捕获阶段阻止事件冒泡，让右键菜单正常工作
  document.addEventListener(
    'contextmenu',
    (e) => {
      e.stopImmediatePropagation();
    },
    true,
  );
  // 同时阻止 oncontextmenu 属性
  document.addEventListener('DOMContentLoaded', () => {
    document.oncontextmenu = null;
  });
  // 如果页面已加载，立即执行
  if (document.readyState !== 'loading') {
    document.oncontextmenu = null;
  }
}

// ---------- 初始化 ----------

function init(): void {
  const bookId = getBookIdFromUrl();
  if (!bookId) return; // 非阅读页，不执行

  unlockRightClick();
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
