import type { CopilotDetail } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { buildCandidates, matchCopilots } from './match'

const NAMES = [
  '发明构思总结',
  '科普大白',
  '提炼检索要素',
  '文献检索',
  '通知书撰写辅助',
  '公开不充分判断',
  '形式缺陷审查',
  '审查意见答复',
  '权利要求常规判断',
  '文献翻译（双向）',
]

const createCopilots = (names: string[]) =>
  names.map((name, index) => ({ id: String(index + 1), name })) as unknown as CopilotDetail[]

const candidates = buildCandidates(createCopilots(NAMES))
const search = (query: string) => matchCopilots(candidates, query).map((item) => item.copilot.name)

describe('matchCopilots', () => {
  it('空查询返回全部搭档', () => {
    expect(search('')).toHaveLength(NAMES.length)
  })

  it('纯数字按序号精确命中', () => {
    expect(search('2')).toEqual(['科普大白'])
    expect(search('02')).toEqual(['科普大白'])
    expect(search('4')).toEqual(['文献检索'])
    expect(search('04')).toEqual(['文献检索'])
    expect(search('10')).toEqual(['文献翻译（双向）'])
  })

  it('中文关键词按名称匹配', () => {
    expect(search('通知')).toEqual(['通知书撰写辅助'])
  })

  it('中文关键词匹配「科普大白」', () => {
    expect(search('科普')).toEqual(['科普大白'])
  })

  it('拼音首字母匹配', () => {
    expect(search('tzs')).toEqual(['通知书撰写辅助'])
  })

  it('拼音首字母匹配「科普大白」', () => {
    expect(search('kpdb')).toEqual(['科普大白'])
  })

  it('拼音全拼匹配「科普大白」', () => {
    expect(search('kepudabai')).toEqual(['科普大白'])
  })

  it('拼音全拼匹配', () => {
    expect(search('tongzhi')).toEqual(['通知书撰写辅助'])
  })

  it('拼音首字母匹配「文献检索」', () => {
    expect(search('wxjs')).toEqual(['文献检索'])
  })

  it('拼音全拼匹配「文献检索」', () => {
    expect(search('wenxianjiansuo')).toEqual(['文献检索'])
  })

  it('同前缀拼音命中多个搭档时按序号排序', () => {
    expect(search('wenxian')).toEqual(['文献检索', '文献翻译（双向）'])
  })

  it('多个命中时命中位置越靠前越优先', () => {
    expect(search('审查')).toEqual(['审查意见答复', '形式缺陷审查'])
  })

  it('多 token 为 AND 关系', () => {
    expect(search('通知书 撰写')).toEqual(['通知书撰写辅助'])
    expect(search('tzs fz')).toEqual(['通知书撰写辅助'])
  })

  it('无匹配返回空数组', () => {
    expect(search('不存在的搭档')).toEqual([])
    expect(search('zzz')).toEqual([])
  })

  it('未收录的搭档退化为中文名匹配', () => {
    const custom = buildCandidates(createCopilots(['我的自定义搭档']))
    expect(matchCopilots(custom, '自定义')).toHaveLength(1)
    expect(matchCopilots(custom, 'wdzdy')).toHaveLength(0)
  })
})
