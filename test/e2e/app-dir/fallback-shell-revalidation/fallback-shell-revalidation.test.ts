import type * as Playwright from 'playwright'
import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'

// Automatic prefetching requires a production server.
//
// The legacy Vercel builder puts this fallback's HTML and RSC in separate
// revalidation groups, so their cached values can differ.
// @force-gate prefetching && (!vercel || adapter)
describe('fallback-shell-revalidation', () => {
  const { next, isNextDeploy } = nextTestSetup({ files: __dirname })

  it('serves the same regenerated shell in HTML and segment prefetches', async () => {
    const pathname = '/fallback-shell-revalidation/a/b'
    const before = await next.render$(pathname)
    const previousGeneration = before('#generation').text()
    expect(previousGeneration).not.toBe('')

    const revalidation = await next.fetch(
      '/fallback-shell-revalidation/revalidate',
      { method: 'POST' }
    )
    expect(revalidation.status).toBe(200)

    let generation = ''
    await retry(
      async () => {
        const response = await next.fetch(pathname)
        expect(response.status).toBe(200)
        const $ = cheerio.load(await response.text())
        generation = $('#generation').text()
        expect(generation).not.toBe('')
        expect(generation).not.toBe(previousGeneration)
        if (await gate((c) => c.vercel)) {
          expect(response.headers.get('x-vercel-cache')).toBe('HIT')
        }
      },
      isNextDeploy ? 30_000 : 3000
    )

    let page!: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    try {
      const act = createRouterAct(page, { includeAppShellRequests: true })
      await act(
        async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${pathname}"]`)
            .click()
        },
        // HTML and prefetched segments must share one prerendered shell. A
        // separate prerender per output would produce different cached UUIDs
        // and violate that requirement.
        { includes: generation }
      )

      await act(async () => {
        await browser.elementByCss(`a[href="${pathname}"]`).click()
      })
      expect(await browser.elementById('generation').text()).toBe(generation)
      expect(await browser.elementById('params').text()).toBe('a/b')
    } finally {
      await browser.close()
    }
  })
})
