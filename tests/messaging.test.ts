import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeMock, resetChromeMock } from './setup';
import { onBg, sendBg, startMessageRouter } from '../src/lib/messaging/bridge';
import { MsgType } from '../src/lib/messaging/types';

describe('messaging bridge', () => {
  let capturedHandler: ((msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined) | null = null;

  beforeEach(() => {
    resetChromeMock();
    capturedHandler = null;
    chromeMock.runtime.onMessage.addListener.mockImplementation((cb) => {
      capturedHandler = cb as typeof capturedHandler;
    });
  });

  it('sendBg 抛错当响应 ok=false', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ ok: false, error: '失败' } as never);
    await expect(sendBg({ type: MsgType.LIST_ACCOUNTS })).rejects.toThrow('失败');
  });

  it('sendBg 抛错当无响应', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue(null as never);
    await expect(sendBg({ type: MsgType.LIST_ACCOUNTS })).rejects.toThrow('消息通信失败');
  });

  it('startMessageRouter 注册 handler 后，bg 端能处理消息', async () => {
    const handler = vi.fn(async () => ['account1']);
    onBg<string[]>(MsgType.LIST_ACCOUNTS, handler);
    startMessageRouter();
    expect(capturedHandler).not.toBeNull();

    const sendResponse = vi.fn();
    const result = capturedHandler!({ type: MsgType.LIST_ACCOUNTS }, {}, sendResponse);
    // 异步响应返回 true
    expect(result).toBe(true);
    // 等待 Promise 完成
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: ['account1'] });
  });

  it('未注册的 type 应返回 ok=false', async () => {
    startMessageRouter();
    const sendResponse = vi.fn();
    capturedHandler!({ type: 'UNKNOWN_TYPE' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: expect.stringContaining('未知消息类型') });
  });

  it('handler 抛错时返回 ok=false + error message', async () => {
    onBg(MsgType.GET_ACTIVE, async () => {
      throw new Error('handler boom');
    });
    startMessageRouter();
    const sendResponse = vi.fn();
    capturedHandler!({ type: MsgType.GET_ACTIVE }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'handler boom' });
  });
});
