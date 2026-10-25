/**
 * 审查搭档拼音索引（零依赖硬编码）。
 *
 * 仅覆盖内置 10 个审查搭档：名称固定、变更频率极低，因此直接硬编码首字母与全拼，
 * 避免为 10 个条目引入拼音词库（pinyin-pro 等）带来的体积与依赖成本。
 *
 * 未收录的名称（远程搭档 / 用户自建搭档）会退化为纯中文名匹配，
 * 因为 match.ts 中 initials / full 为空串时不会命中拼音分支。
 */
export type PinyinEntry = {
  /** 拼音首字母，如「通知书撰写辅助」→ tzszxfz */
  initials: string
  /** 全拼（无音调、无分隔），如「通知书撰写辅助」→ tongzhishuzhuanxiefuzhu */
  full: string
}

const EMPTY_PINYIN: PinyinEntry = { initials: '', full: '' }

export const COPILOT_PINYIN: Record<string, PinyinEntry> = {
  发明构思总结: { initials: 'fmgzzj', full: 'faminggousizongjie' },
  科普大白: { initials: 'kpdb', full: 'kepudabai' },
  提炼检索要素: { initials: 'tljsys', full: 'tilianjiansuoyaosu' },
  文献检索: { initials: 'wxjs', full: 'wenxianjiansuo' },
  通知书撰写辅助: { initials: 'tzszxfz', full: 'tongzhishuzhuanxiefuzhu' },
  公开不充分判断: { initials: 'gkbcfpd', full: 'gongkaibuchongfenpanduan' },
  形式缺陷审查: { initials: 'xsqxsc', full: 'xingshiquexianshencha' },
  审查意见答复: { initials: 'scyjdf', full: 'shenchayijiandafu' },
  权利要求常规判断: { initials: 'qlyqcgpd', full: 'quanliyaoqiuchangguipanduan' },
  '文献翻译（双向）': { initials: 'wxfysx', full: 'wenxianfanyishuangxiang' },
}

export function getPinyin(name: string): PinyinEntry {
  return COPILOT_PINYIN[name] ?? EMPTY_PINYIN
}
