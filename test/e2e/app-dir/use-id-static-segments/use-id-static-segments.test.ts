import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

/**
 * Reads the markers that are actually on screen.
 *
 * With Cache Components the router keeps the last few segments that were
 * active at each level mounted inside a hidden `<Activity>` boundary, so the
 * document also holds markers belonging to pages the user has navigated away
 * from. Those are filtered out here: whether a retained hidden page may share
 * ids with the visible one is a separate question from the one these tests ask.
 */
async function visibleMarkerIds(
  browser: Playwright
): Promise<Record<string, string>> {
  return browser.eval(`
    Object.fromEntries(
      Array.from(document.querySelectorAll('[data-marker]'))
        .filter((el) =>
          typeof el.checkVisibility === 'function'
            ? el.checkVisibility()
            : el.offsetParent !== null
        )
        .map((el) => [
          el.getAttribute('data-marker'),
          el.getAttribute('data-marker-id'),
        ])
    )
  `)
}

function expectAllDistinct(found: Record<string, string>) {
  const ids = Object.values(found)
  expect(ids.length).toBeGreaterThan(1)
  expect(new Set(ids).size).toBe(ids.length)
}

describe('useId across statically prerendered segments', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('numbers each route consistently within its own prerender', async () => {
    for (const path of ['/', '/other']) {
      const $ = await next.render$(path)
      const ids = $('[data-marker]')
        .toArray()
        .map((el) => $(el).attr('data-marker-id'))

      expect(ids.length).toBeGreaterThan(1)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  /**
   * A prerender numbers every segment of one URL in a single pass, and a
   * layout's ids are minted before the child segment's regardless of where
   * `{children}` sits in the layout's JSX. So `bottom` lands on the same
   * counter on both routes, and a page segment carved out of one prerender
   * cannot land on a counter its layout is already using.
   *
   * Runtime navigation renders carry their own prefix; prerendered segments
   * rely on that ordering instead, so this guards the ordering itself. If page
   * ids ever began interleaving with layout ids, `bottom` would differ between
   * the two routes and this navigation would produce a duplicate.
   */
  it('does not collide when a prefetched page segment joins a retained layout', async () => {
    const browser = await next.browser('/')
    const before = await visibleMarkerIds(browser)
    expectAllDistinct(before)

    await browser.elementById('to-other').click()
    await retry(async () => {
      expect((await visibleMarkerIds(browser))['other-b']).toBeDefined()
    })

    const after = await visibleMarkerIds(browser)
    // The layout was not re-rendered, so its ids still come from `/`'s prerender.
    expect(after.top).toBe(before.top)
    expect(after.bottom).toBe(before.bottom)
    // The page we navigated away from is no longer displayed.
    expect(after.home).toBeUndefined()
    expectAllDistinct(after)
  })
})
