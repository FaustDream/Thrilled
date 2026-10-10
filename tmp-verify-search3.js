async (page) => {
  const out = {}
  const clickAct = async (sel) => {
    await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), sel)
    await page.waitForTimeout(300)
  }
  const openSearchTab = async () => {
    await clickAct('[data-act="dock-act"][data-v="setting"]')
    await page.evaluate(() => [...document.querySelectorAll('.dw-tab')].find((t) => t.textContent.trim() === '搜索')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await page.waitForTimeout(350)
  }
  const slider = async (label, v) => {
    await page.evaluate(([l, val]) => {
      const row = [...document.querySelectorAll('.dw-body .slider-row')].find((r) => r.querySelector('.sl-label')?.textContent?.includes(l))
      const input = row.querySelector('input[type=range]')
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(input, val)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, [label, v])
    await page.waitForTimeout(300)
  }

  await page.evaluate(() => localStorage.removeItem('thrilled:v4:doc'))
  await page.reload()
  await page.waitForTimeout(700)
  const w = page.locator('button', { hasText: '稍后再说' })
  if (await w.count()) await w.click()
  await page.waitForTimeout(400)

  /* ① 字号 + 距顶：出厂 15px / 44px，改成 20px / 20px 后测样式 */
  await openSearchTab()
  await slider('字号', '20')
  await slider('距顶', '20')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.sized = await page.evaluate(() => {
    const probe = (el, prop) => el === null ? null : getComputedStyle(el)[prop]
    const box = document.querySelector('.search-box')
    const row = document.querySelector('.search-row')
    const input = box.querySelector('input')
    const panel = document.querySelector('.engine-panel') || document.querySelector('.search-panel')
    return {
      inputFontSize: probe(input, 'fontSize'),
      rowTop: probe(row, 'top'),
      panelTop: probe(panel, 'top'),
      gridTop: probe(document.querySelector('.grid'), 'top'),
    }
  })

  /* ② 回车与放大镜分别指定：回车=新标签页、放大镜=本窗口 */
  await openSearchTab()
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.dw-body .f-row')].find((r) => r.querySelector('.f-label')?.textContent === '回车时打开方式')
    const cats = [...row.querySelectorAll('.cat')]
    cats.find((c) => c.textContent === '新标签页')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const row2 = [...document.querySelectorAll('.dw-body .f-row')].find((r) => r.querySelector('.f-label')?.textContent === '点放大镜时')
    const cats2 = [...row2.querySelectorAll('.cat')]
    cats2.find((c) => c.textContent === '本窗口')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const row3 = [...document.querySelectorAll('.dw-body .switch-row')].find((r) => (r.querySelector('div > span')?.textContent ?? '').includes('搜索后自动失焦'))
    row3?.querySelector('.switch')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const row4 = [...document.querySelectorAll('.dw-body .switch-row')].find((r) => (r.querySelector('div > span')?.textContent ?? '').includes('显示单条删除'))
    row4?.querySelector('.switch')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.modes = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('thrilled:v4:doc')).settings
    return { enter: d.searchEnterMode, btn: d.searchBtnMode, blur: d.blurAfterSearch, del: d.historyItemDel }
  })
  out.delCount = await page.evaluate(() => document.querySelectorAll('.sp-del').length)
  return JSON.stringify(out)
}
