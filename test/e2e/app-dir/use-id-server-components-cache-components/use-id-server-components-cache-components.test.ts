import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

type Marker = { id: string; render: string }

async function markers(browser: Playwright): Promise<Record<string, Marker>> {
  return browser.eval(`
    Object.fromEntries(
      Array.from(document.querySelectorAll('[data-marker]')).map((el) => [
        el.getAttribute('data-marker'),
        {
          id: el.getAttribute('data-marker-id'),
          render: el.getAttribute('data-render'),
        },
      ])
    )
  `)
}

function expectAllIdsDistinct(found: Record<string, Marker>) {
  const ids = Object.values(found).map((marker) => marker.id)
  expect(ids.length).toBeGreaterThan(1)
  expect(new Set(ids).size).toBe(ids.length)
}

/** Waits for `home` to be re-rendered, rather than merely to be present. */
async function waitForHomeRerender(browser: Playwright, before: Marker) {
  await retry(async () => {
    const found = await markers(browser)
    expect(found.home?.render).toBeDefined()
    expect(found.home.render).not.toBe(before.render)
  })
}

describe('useId in Server Components (Cache Components)', () => {
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

  // The reproduction: a navigation renders the new page in a Flight render of
  // its own while the layout stays mounted with ids from the document render.
  it('does not collide with a persisting layout after a client-side navigation', async () => {
    const browser = await next.browser('/other')
    const before = await markers(browser)
    expectAllIdsDistinct(before)

    await browser.elementById('to-home').click()
    await retry(async () => {
      expect((await markers(browser)).home?.id).toBeDefined()
    })

    const after = await markers(browser)
    // The condition the ids have to survive: the layout was not re-rendered, so
    // its ids and the page's come from two different Flight renders.
    expect(after.layout.id).toBe(before.layout.id)
    expect(after.layout.render).toBe(before.layout.render)
    expectAllIdsDistinct(after)
  })

  // A revalidating action re-renders the whole tree, so its ids cannot collide
  // with a persisting layout. This guards that: were an action response to
  // become a partial re-render, it would need a prefix of its own.
  it('keeps ids distinct when a Server Action re-renders the tree', async () => {
    const browser = await next.browser('/')
    const before = await markers(browser)
    expectAllIdsDistinct(before)

    await browser.elementById('run-action').click()
    await waitForHomeRerender(browser, before.home)

    const after = await markers(browser)
    expect(after.layout.render).not.toBe(before.layout.render)
    expectAllIdsDistinct(after)
  })

  // Same shape as the action case, through the refresh path instead.
  it('keeps ids distinct when router.refresh() re-renders the tree', async () => {
    const browser = await next.browser('/')
    const before = await markers(browser)
    expectAllIdsDistinct(before)

    await browser.elementById('refresh').click()
    await waitForHomeRerender(browser, before.home)

    const after = await markers(browser)
    expect(after.layout.render).not.toBe(before.layout.render)
    expectAllIdsDistinct(after)
  })
})
