/**
 * i18n wrapper：统一封装 chrome.i18n.getMessage 的调用
 * popup/options 直接 import { t } 使用，避免散落调用。
 *
 * 字符串在 _locales/{zh_CN,en}/messages.json 中维护。
 */

export function t(key: string, substitutions?: string | string[]): string {
  const msg = chrome.i18n.getMessage(key, substitutions);
  return msg || key;
}

export function getLocale(): string {
  return chrome.i18n.getUILanguage();
}

/** 批量应用 data-i18n / data-i18n-placeholder 属性 */
export function applyI18n(root: HTMLElement = document.documentElement): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.setAttribute('placeholder', msg);
  });
}
