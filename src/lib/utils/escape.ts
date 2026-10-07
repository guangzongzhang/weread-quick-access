// HTML 转义工具，防止 XSS（不依赖 DOM，service worker 可用）

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(text: string): string {
  return text.replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPES[c] ?? c);
}
