/** popup ↔ background 消息 schema */

export const MsgType = {
  LIST_ACCOUNTS: 'LIST_ACCOUNTS',
  GET_ACTIVE: 'GET_ACTIVE',
  SET_ACTIVE: 'SET_ACTIVE',
  SAVE_CURRENT: 'SAVE_CURRENT',
  REMOVE_ACCOUNT: 'REMOVE_ACCOUNT',
  RENAME_ACCOUNT: 'RENAME_ACCOUNT',
  GET_AUTO_LOGIN: 'GET_AUTO_LOGIN',
  SET_AUTO_LOGIN: 'SET_AUTO_LOGIN',
  CLEAR_ALL: 'CLEAR_ALL',
  OPEN_WEREAD: 'OPEN_WEREAD',
  GET_SHELF_PREVIEW: 'GET_SHELF_PREVIEW',
  GET_ALL_SHELF: 'GET_ALL_SHELF',
  GET_RECENT_BOOK: 'GET_RECENT_BOOK',
} as const;

export type MessageType = (typeof MsgType)[keyof typeof MsgType];

export interface RequestMessage {
  type: MessageType;
  payload?: unknown;
}

export interface ResponseMessage<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AccountBrief {
  id: string;
  name: string;
  userId?: string;
  createdAt: number;
  lastUsedAt: number;
  isActive: boolean;
}

export interface ShelfBook {
  bookId: string;       // 阅读页 ID（24 位 hex 或其他格式）
  bookIdNum?: string;   // 数字 ID（用于调用 infoById API 获取正确 bookId）
  title: string;
  author: string;
  cover: string;
  progress: number; // 0-1
  lastReadTime: number; // 最近阅读时间戳（ms）
  readingTime?: number; // 累计阅读时长（秒）
  url: string;
}
