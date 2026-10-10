async (page) => {
  const out = {}
  const openSearchTab = async () => {
    await page.evaluate(() => document.querySelector('[data-act="dock-act"][data-v="setting"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await page.waitForTimeout(300)
    await page.evaluate(() => [...document.querySelectorAll('.dw-tab')].find((t) => t.textContent.trim() === '搜索')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await page.waitForTimeout(350)
  }
  const toggleSwitch = async (label) => {
    await page.evaluate((l) => {
      const row = [...document.querySelectorAll('.dw-body .switch-row')].find((r) => (r.querySelector('div > span')?.textContent ?? '').includes(l))
      row?.querySelector('.switch')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }, label)
    await page.waitForTimeout(500)
  }

  await openSearchTab()
  out.before = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('thrilled:v4:doc')).settings
    return { blur: d.blurAfterSearch, del: d.historyItemDel }
  })
  await toggleSwitch('搜索后自动失焦')
  await toggleSwitch('显示单条删除')
  out.afterToggle = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('thrilled:v4:doc')).settings
    const rows = [...document.querySelectorAll('.dw-body .switch-row')]
    return {
      blur: d.blurAfterSearch, del: d.historyItemDel,
      blurSwitchOn: rows.find((r) => (r.querySelector('div > span')?.textContent ?? '').includes('搜索后自动失焦'))?.querySelector('.switch')?.classList.contains('on'),
      delSwitchOn: rows.find((r) => (r.querySelector('div > span')?.textContent ?? '').includes('显示单条删除'))?.querySelector('.switch')?.classList.contains('on'),
    }
  })
  /* 搜索后失焦：把焦点放进输入框再回车，断言 activeElement 不再是输入框 */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  await page.evaluate(() => document.getElementById('searchInput')?.focus())
  await page.evaluate(() => {
    const el = document.getElementById('searchInput')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, '测试词')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await page.waitForTimeout(400)
  out.afterSearch = await page.evaluate(() => ({
    activeIsInput: document.activeElement === document.getElementById('searchInput'),
    history: JSON.parse(localStorage.getItem('thrilled:v4:doc')).history,
  }))
  return JSON.stringify(out)
}
