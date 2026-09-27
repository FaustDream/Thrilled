/**
 * 品牌表与站点 URL 注册表
 *
 * - 视觉：品牌色 + 字形（统一图标容器规范 02 §12.2，真 Logo 后续替换）
 * - URL：Dock 应用 / 网址导航 / 图标卡片打开真实站点用；无 URL 的名称回退搜索
 */
export interface Brand {
  color: string
  glyph: string
  latin?: boolean
  url?: string
}

export const BRANDS: Record<string, Brand> = {
  '哔哩哔哩': { color: '#00A1D6', glyph: '哔', url: 'https://www.bilibili.com' },
  '知乎': { color: '#0084FF', glyph: '知', url: 'https://www.zhihu.com' },
  '微博': { color: '#E6162D', glyph: '微', url: 'https://weibo.com' },
  '百度': { color: '#2932E1', glyph: '百', url: 'https://www.baidu.com' },
  '腾讯视频': { color: '#FF6A00', glyph: '视', url: 'https://v.qq.com' },
  '爱奇艺': { color: '#00BE06', glyph: '爱', url: 'https://www.iqiyi.com' },
  '优酷': { color: '#1FA6E0', glyph: '优', url: 'https://www.youku.com' },
  '芒果TV': { color: '#FF8500', glyph: '芒', url: 'https://www.mgtv.com' },
  '抖音': { color: '#161823', glyph: '抖', url: 'https://www.douyin.com' },
  '快手': { color: '#FF4906', glyph: '快', url: 'https://www.kuaishou.com' },
  '西瓜视频': { color: '#F94D2E', glyph: '西', url: 'https://www.ixigua.com' },
  '网易云音乐': { color: '#C20C0C', glyph: '网', url: 'https://music.163.com' },
  'QQ音乐': { color: '#31C27C', glyph: 'Q', latin: true, url: 'https://y.qq.com' },
  '咪咕视频': { color: '#E60012', glyph: '咪', url: 'https://www.miguvideo.com' },
  'Steam': { color: '#1B2838', glyph: 'St', latin: true, url: 'https://store.steampowered.com' },
  'Epic': { color: '#2A2A2A', glyph: 'Ep', latin: true, url: 'https://store.epicgames.com' },
  'TapTap': { color: '#00C4C4', glyph: 'T', latin: true, url: 'https://www.taptap.cn' },
  '米游社': { color: '#4EA1E0', glyph: '米', url: 'https://www.miyoushe.com' },
  '微信': { color: '#07C160', glyph: '微', url: 'https://weixin.qq.com' },
  'QQ': { color: '#12B7F5', glyph: 'Q', latin: true, url: 'https://im.qq.com' },
  '豆瓣': { color: '#2E963D', glyph: '豆', url: 'https://www.douban.com' },
  '小红书': { color: '#FF2442', glyph: '小', url: 'https://www.xiaohongshu.com' },
  '钉钉': { color: '#0089FF', glyph: '钉', url: 'https://www.dingtalk.com' },
  '飞书': { color: '#3370FF', glyph: '飞', url: 'https://www.feishu.cn' },
  'Discord': { color: '#5865F2', glyph: 'D', latin: true, url: 'https://discord.com' },
  'Telegram': { color: '#2AABEE', glyph: 'T', latin: true, url: 'https://telegram.org' },
  '学习通': { color: '#2E7BD6', glyph: '学', url: 'https://i.chaoxing.com' },
  '网易公开课': { color: '#C20C0C', glyph: '公', url: 'https://open.163.com' },
  '得到': { color: '#D93A2B', glyph: '得', url: 'https://www.dedao.cn' },
  '语雀': { color: '#25B864', glyph: '语', url: 'https://www.yuque.com' },
  'Notion': { color: '#1F1F1F', glyph: 'N', latin: true, url: 'https://www.notion.so' },
  '石墨文档': { color: '#2E7BE0', glyph: '石', url: 'https://shimo.im' },
  '腾讯文档': { color: '#2F6BFF', glyph: '文', url: 'https://docs.qq.com' },
  '印象笔记': { color: '#2DBE60', glyph: '印', url: 'https://www.yinxiang.com' },
  'Gmail': { color: '#EA4335', glyph: 'M', latin: true, url: 'https://mail.google.com' },
  'GitHub': { color: '#24292F', glyph: 'G', latin: true, url: 'https://github.com' },
  'YouTube': { color: '#FF0000', glyph: 'Y', latin: true, url: 'https://www.youtube.com' },
  'Reddit': { color: '#FF4500', glyph: 'R', latin: true, url: 'https://www.reddit.com' },
  'Figma': { color: '#0D99FF', glyph: 'F', latin: true, url: 'https://www.figma.com' },
  'Dribbble': { color: '#EA4C89', glyph: 'D', latin: true, url: 'https://dribbble.com' },
  'Stack Overflow': { color: '#F48024', glyph: 'S', latin: true, url: 'https://stackoverflow.com' },
  'Medium': { color: '#111111', glyph: 'M', latin: true, url: 'https://medium.com' },
  'Spotify': { color: '#1DB954', glyph: 'S', latin: true, url: 'https://open.spotify.com' },
  'Netflix': { color: '#E50914', glyph: 'N', latin: true, url: 'https://www.netflix.com' },
  '翻译': { color: '#3B82F6', glyph: '译' },
  '计算器': { color: '#8B5CF6', glyph: '算' },
  '汇率': { color: '#0EA5E9', glyph: '汇' },
  '快递': { color: '#FF6A00', glyph: '递' },
  '记账': { color: '#F59E0B', glyph: '记' },
  '二维码': { color: '#111827', glyph: '码' },
  '截图': { color: '#6366F1', glyph: '截' },
  '便签': { color: '#FBBF24', glyph: '签' },
  '淘宝': { color: '#FF4400', glyph: '淘', url: 'https://www.taobao.com' },
  '天猫': { color: '#FF0036', glyph: '猫', url: 'https://www.tmall.com' },
  '京东': { color: '#E1251B', glyph: '京', url: 'https://www.jd.com' },
  '拼多多': { color: '#E02E24', glyph: '拼', url: 'https://www.pinduoduo.com' },
  '唯品会': { color: '#E1006E', glyph: '唯', url: 'https://www.vip.com' },
  '苏宁易购': { color: '#FFAA00', glyph: '苏', url: 'https://www.suning.com' },
  '闲鱼': { color: '#E8C400', glyph: '闲', url: 'https://www.goofish.com' },
  '得物': { color: '#00C2B3', glyph: '得', url: 'https://www.dewu.com' },
  '豆包': { color: '#3B82F6', glyph: '豆', url: 'https://www.doubao.com' },
  'Kimi': { color: '#1F2937', glyph: 'K', latin: true, url: 'https://kimi.moonshot.cn' },
  '文心一言': { color: '#2932E1', glyph: '文', url: 'https://yiyan.baidu.com' },
  '通义千问': { color: '#605CE5', glyph: '通', url: 'https://tongyi.aliyun.com' },
  '智谱清言': { color: '#2C6BED', glyph: '智', url: 'https://chatglm.cn' },
  '讯飞星火': { color: '#1E88E5', glyph: '讯', url: 'https://xinghuo.xfyun.cn' },
  'DeepSeek': { color: '#20304F', glyph: 'D', latin: true, url: 'https://chat.deepseek.com' },
  '即梦AI': { color: '#1B1B1F', glyph: '即', url: 'https://jimeng.jianying.com' },
  '可灵AI': { color: '#111827', glyph: '可', url: 'https://klingai.kuaishou.com' },
  'ChatGPT': { color: '#10A37F', glyph: 'G', latin: true, url: 'https://chat.openai.com' },
  'Claude': { color: '#D97757', glyph: 'C', latin: true, url: 'https://claude.ai' },
  '秘塔AI搜索': { color: '#2B6BE4', glyph: '秘', url: 'https://metaso.cn' },
  '音乐': { color: '#EC4899', glyph: '乐', url: 'https://music.163.com' },
  '影视': { color: '#7C3AED', glyph: '影', url: 'https://v.qq.com' },
  '头像': { color: '#E08A4A', glyph: 'T', latin: true },
  '百度网盘': { color: '#3385FF', glyph: '盘', url: 'https://pan.baidu.com' },
  'OneDrive': { color: '#0078D4', glyph: 'O', latin: true, url: 'https://onedrive.live.com' },
  'Dropbox': { color: '#0061FF', glyph: 'D', latin: true, url: 'https://www.dropbox.com' },
  '微信读书': { color: '#1AAD19', glyph: '读', url: 'https://weread.qq.com' },
  '多看阅读': { color: '#FF6A00', glyph: '多', url: 'https://www.duokan.com' },
  '起点读书': { color: '#E4393C', glyph: '起', url: 'https://www.qidian.com' },
  '酷狗音乐': { color: '#00A0E9', glyph: '酷', url: 'https://www.kugou.com' },
  '坚果云': { color: '#2E7BE0', glyph: '坚', url: 'https://www.jianguoyun.com' },
  'Gitee': { color: '#C71D23', glyph: 'G', latin: true, url: 'https://gitee.com' },
  '掘金': { color: '#1E80FF', glyph: '掘', url: 'https://juejin.cn' },
  'CSDN': { color: '#FC5531', glyph: 'C', latin: true, url: 'https://www.csdn.net' },
  '少数派': { color: '#D93A2B', glyph: '少', url: 'https://sspai.com' },
  'V2EX': { color: '#333333', glyph: 'V', latin: true, url: 'https://www.v2ex.com' },
  'Product Hunt': { color: '#DA552F', glyph: 'P', latin: true, url: 'https://www.producthunt.com' },
}

/** 读取品牌视觉（未知名称回退：灰色 + 首字符） */
export const brandOf = (name: string): { color: string; glyph: string; latin: boolean } => {
  const b = BRANDS[name]
  if (b) return { color: b.color, glyph: b.glyph, latin: b.latin === true }
  return { color: '#64748B', glyph: name.slice(0, 1), latin: /^[\x20-\x7E]/.test(name.slice(0, 1)) }
}

/** 读取站点 URL（未知名称返回 null，调用方回退搜索） */
export const siteUrlOf = (name: string): string | null => BRANDS[name]?.url ?? null
