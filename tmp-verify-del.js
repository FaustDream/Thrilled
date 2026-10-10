async (page) => {
  const out = {}
  const panelRows = async () => page.evaluate(() => ({
    rows: document.querySelectorAll('.sp-row').length,
    dels: document.querySelectorAll('.sp-del').length,
  }))
  await page.evaluate(() => document.querySelector('[data-act="dock-act"][data-v="setting"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(300)
  await page.evaluate(() => [...document.querySelectorAll('.dw-tab')].find((t) => t.textContent.trim() === '搜索')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(300)
  await page.evaluate(() => document.getElementById('searchInput')?.focus())
  await page.waitForTimeout(300)
  out.delOn = await panelRows()
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.dw-body .switch-row')].find((r) => (r.querySelector('div > span')?.textContent ?? '').includes('显示单条删除'))
    row?.querySelector('.switch')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(300)
  await page.evaluate(() => document.getElementById('searchInput')?.focus())
  await page.waitForTimeout(250)
  out.delOff = await panelRows()
  await page.evaluate(() => document.getElementById('searchInput')?.blur())
  return JSON.stringify(out)
}
