import { escapeHtml } from '@/lib/utils/escape';
import { sendBg } from '@/lib/messaging/bridge';
import { MsgType, type AccountBrief } from '@/lib/messaging/types';
import { applyI18n } from '@/lib/i18n';

/** 渲染当前账户卡片 + 多账户切换列表 */
export async function renderAccountSection(
  container: HTMLElement,
  onChange: () => void,
): Promise<void> {
  const [active, list] = await Promise.all([
    sendBg<AccountBrief | null>({ type: MsgType.GET_ACTIVE }),
    sendBg<AccountBrief[]>({ type: MsgType.LIST_ACCOUNTS }),
  ]);

  if (!active) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👤</div>
        <div data-i18n="noAccount">暂无保存的账户</div>
      </div>`;
    applyI18n(container);
    return;
  }

  const otherAccounts = list.filter((a) => a.id !== active.id);
  const others = otherAccounts.length
    ? `<div class="account-others">
        ${otherAccounts
          .map(
            (a) => `
          <button class="account-switch" data-id="${escapeHtml(a.id)}" title="${escapeHtml(a.name)}">
            ${escapeHtml(a.name)}
          </button>`,
          )
          .join('')}
      </div>`
    : '';

  container.innerHTML = `
    <div class="account-card">
      <div class="account-avatar">👤</div>
      <div class="account-meta">
        <p class="account-name">${escapeHtml(active.name)}</p>
        <p class="account-sub">${active.userId ? 'ID: ' + escapeHtml(active.userId) : '<span data-i18n="savedAccount">已保存</span>'}</p>
      </div>
    </div>
    ${others}`;

  applyI18n(container);

  // 使用更精确的选择器，只匹配 .account-switch 按钮
  container.querySelectorAll<HTMLButtonElement>('.account-switch[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!id) return;
      try {
        await sendBg({ type: MsgType.SET_ACTIVE, payload: { id } });
        showToast('已切换账户');
        onChange();
      } catch (e) {
        showToast(`切换失败: ${(e as Error).message}`);
      }
    });
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
