/**
 * 类型安全的 popup ↔ background 消息层
 *
 * 用法：
 * - popup 端：const list = await sendBg<AccountBrief[]>({ type: 'LIST_ACCOUNTS' });
 * - bg 端：    onBg('LIST_ACCOUNTS', async () => { ... return accounts; });
 */

import { type RequestMessage, type ResponseMessage } from './types';

export async function sendBg<T = unknown>(msg: RequestMessage): Promise<T> {
  // MV3 service worker 唤醒有时延，首次消息可能失败，重试最多 3 次
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = (await chrome.runtime.sendMessage(msg)) as ResponseMessage<T>;
      if (!res || !res.ok) {
        throw new Error(res?.error ?? '消息通信失败');
      }
      return res.data as T;
    } catch (e) {
      lastError = e;
      // service worker 未就绪时的典型错误，重试
      const message = e instanceof Error ? e.message : String(e);
      if (attempt < 2 && /receiving end does not exist|Could not establish connection|message port closed/i.test(message)) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('消息通信失败');
}

type Handler<T = unknown> = (
  payload: unknown,
  sender: chrome.runtime.MessageSender,
) => Promise<T> | T;

const handlers = new Map<string, Handler>();

export function onBg<T = unknown>(type: string, handler: Handler<T>): void {
  handlers.set(type, handler as Handler);
}

export function startMessageRouter(): void {
  chrome.runtime.onMessage.addListener(
    (msg: RequestMessage, sender, sendResponse) => {
      const handler = handlers.get(msg.type);
      if (!handler) {
        const resp: ResponseMessage = { ok: false, error: `未知消息类型: ${msg.type}` };
        sendResponse(resp);
        return false;
      }
      Promise.resolve(handler(msg.payload, sender))
        .then((data) => sendResponse({ ok: true, data } satisfies ResponseMessage))
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          sendResponse({ ok: false, error: message } satisfies ResponseMessage);
        });
      return true; // 异步响应
    },
  );
}
