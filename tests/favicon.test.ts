/**
 * favicon 首页解析（SW 侧纯函数）单测
 * 覆盖：图标类型优先级 / sizes 加权 / http origin 拼地址 / 非法与重复候选剔除 / data: 内联图标
 */
import { describe, expect, it } from 'vitest'
import { parseIconLinks } from '../src/background/favicon-resolver'

const ORIGIN = 'https://example.com'

describe('parseIconLinks：首页 <link rel="icon"> 候选', () => {
  it('apple-touch-icon 排在普通 icon 之前', () => {
    const html = `
      <link rel="icon" href="/favicon-32.png">
      <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    `
    expect(parseIconLinks(html, ORIGIN)).toEqual([
      'https://example.com/apple-touch-icon.png',
      'https://example.com/favicon-32.png',
    ])
  })

  it('相对地址按传入的 origin 解析（http 站点不会被拼成 https）', () => {
    const html = '<link rel="shortcut icon" href="images/logo.ico">'
    expect(parseIconLinks(html, 'http://old.example.com')).toEqual([
      'http://old.example.com/images/logo.ico',
    ])
  })

  it('sizes 更大的候选优先', () => {
    const html = `
      <link rel="icon" sizes="16x16" href="/16.png">
      <link rel="icon" sizes="192x192" href="/192.png">
    `
    expect(parseIconLinks(html, ORIGIN)[0]).toBe('https://example.com/192.png')
  })

  it('剔除 mask-icon 与非法域名的候选，保留合法路径', () => {
    const html = `
      <link rel="mask-icon" href="/mask.svg">
      <link rel="icon" href="https://bad_host/favicon.ico">
      <link rel="icon" href="/ok.ico">
    `
    expect(parseIconLinks(html, ORIGIN)).toEqual(['https://example.com/ok.ico'])
  })

  it('data: 内联图标原样保留', () => {
    const html = '<link rel="icon" href="data:image/png;base64,AAAA">'
    expect(parseIconLinks(html, ORIGIN)).toEqual(['data:image/png;base64,AAAA'])
  })

  it('重复地址只保留一条', () => {
    const html = `
      <link rel="icon" href="/favicon.ico">
      <link rel="shortcut icon" href="/favicon.ico">
    `
    expect(parseIconLinks(html, ORIGIN)).toEqual(['https://example.com/favicon.ico'])
  })

  it('没有图标链接时返回空数组', () => {
    expect(parseIconLinks('<link rel="stylesheet" href="/a.css">', ORIGIN)).toEqual([])
  })
})
