/**
 * 微信读书 Web API 端点常量
 *
 * 注意：以下路径基于公开信息推断，实际实施时需打开 weread.qq.com DevTools 抓包确认。
 * 若 API 反爬严重或鉴权失败，弹窗应降级为快捷链接方案（不调 API，只显示按钮跳转）。
 */

export const WEREAD_ENDPOINTS = {
  /** 书架同步：返回当前账户书架（含阅读进度） */
  SHELF_SYNC: 'https://weread.qq.com/web/shelf/sync',
  /** 搜索：微信读书为 hash 路由，格式 #/search?query=关键词 */
  SEARCH: (q: string) => `https://weread.qq.com/#/search?query=${encodeURIComponent(q)}`,
  /** 阅读页：按 bookId（24位字符，含 g）跳转，使用 reader 路径 */
  BOOK_READER: (bookId: string) => `https://weread.qq.com/web/reader/${bookId}`,
  /** 书籍详情页：按 bookId（24位十六进制）跳转 */
  BOOK_INFO: (bookId: string) => `https://weread.qq.com/web/bookDetail/${bookId}`,
  /** 主站 */
  HOME: 'https://weread.qq.com/',
  /** 书架页 */
  SHELF: 'https://weread.qq.com/#/shelf',
  /** 笔记/划线页 */
  NOTE: 'https://weread.qq.com/#/note',

  // ---------- 以下来自 weread-toolbox，使用 i.weread.qq.com 域名 ----------
  /** 全书标注列表 */
  BOOKMARKS: (bookId: string) => `https://i.weread.qq.com/book/bookmarklist?bookId=${bookId}`,
  /** 热门标注 */
  BEST_BOOKMARKS: (bookId: string) => `https://i.weread.qq.com/book/bestbookmarks?bookId=${bookId}`,
  /** 章节信息 */
  CHAPTER_INFOS: (bookId: string) => `https://i.weread.qq.com/book/chapterInfos?bookIds=${bookId}&synckeys=0`,
  /** 书籍信息（i 域） */
  BOOK_INFO_I: (bookId: string) => `https://i.weread.qq.com/book/info?bookId=${bookId}`,
  /** 阅读信息（含时长、状态） */
  READ_INFO: (bookId: string) => `https://i.weread.qq.com/book/readinfo?bookId=${bookId}&readingDetail=1&readingBookIndex=1&finishedDate=1`,
  /** 书评/想法列表 */
  REVIEWS: (bookId: string) => `https://i.weread.qq.com/review/list?bookId=${bookId}&listType=11&mine=1&synckey=0&listMode=0`,
} as const;
