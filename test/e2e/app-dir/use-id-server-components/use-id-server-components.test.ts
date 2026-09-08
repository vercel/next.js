import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

async function markerIds(browser: Playwright): Promise<Record<string, string>> {
  return browser.eval(`
    Object.fromEntries(
      Array.from(document.querySelectorAll('[data-marker]')).map((el) => [
        el.getAttribute('data-marker'),
        el.getAttribute('data-marker-id'),
      ])
    )
  `)
}

function expectAllDistinct(ids: Record<string, string>) {
  const values = Object.values(ids)
  expect(values.length).toBeGreaterThan(1)
  expect(new Set(values).size).toBe(values.length)
}

async function navigateHome(browser: Playwright) {
  await browser.elementById('to-home').click()
  await retry(async () => {
    expect(await browser.elementByCss('[data-marker="home"]').text()).toMatch(
      /^home: /
    )
  })
}

describe('useId in Server Components', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('mints distinct ids within a single document render', async () => {
    const $ = await next.render$('/')
    const ids = $('[data-marker]')
      .toArray()
      .map((el) => $(el).attr('data-marker-id'))

    expect(ids.length).toBeGreaterThan(1)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not collide with a persisting layout after a client-side navigation', async () => {
    const browser = await next.browser('/other')
    const before = await markerIds(browser)
    expectAllDistinct(before)

    await navigateHome(browser)

    const after = await markerIds(browser)
    expectAllDistinct(after)
    // The layout was not re-rendered, so its ids still come from the document
    // render while the page's come from a separate Flight render.
    expect(after.layout).toBe(before.layout)
  })

  it('does not collide with a persisting layout after a Server Action', async () => {
    const browser = await next.browser('/other')
    await navigateHome(browser)

    await browser.elementById('run-action').click()
    await retry(async () => {
      expect(Object.keys(await markerIds(browser))).toContain('home')
    })

    expectAllDistinct(await markerIds(browser))
  })

  it('does not collide with a persisting layout after router.refresh()', async () => {
    const browser = await next.browser('/other')
    await navigateHome(browser)

    await browser.elementById('refresh').click()
    await retry(async () => {
      expect(Object.keys(await markerIds(browser))).toContain('home')
    })

    expectAllDistinct(await markerIds(browser))
  })
})
