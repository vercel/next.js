import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('module-level caches keyed on the headers object', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Runtime prefetching only happens in production builds.
    it('is skipped in dev', () => {})
    return
  }

  it('renders dynamic content on navigation even when the spawned runtime prerender populated the cache first', async () => {
    const cliOutputStart = next.cliOutput.length

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link, triggering the runtime prefetch.
    await act(
      async () => {
        const linkToggle = await browser.elementByCss(
          'input[data-link-accordion="/dynamic"]'
        )
        await linkToggle.click()
      },
      { includes: 'Header:' }
    )

    // Navigate. The navigation request also spawns a runtime prerender to
    // refresh the client's prefetch cache, which reaches the module-level
    // cache before the stage-gated dynamic render of the navigation does.
    // Because each render pass resolves `headers()` to a distinct object, the
    // hanging connection() promise it memoizes is keyed to the prerender pass
    // only: the navigation's dynamic render misses the cache, creates its own
    // promise, and connection() resolves, so the dynamic content renders.
    await browser.elementByCss('a[href="/dynamic"]').click()

    await retry(async () => {
      expect(await browser.elementById('dynamic-content').text()).toBe(
        'Dynamic content: request data'
      )
    })
    expect(await browser.hasElementByCssSelector('#dynamic-error')).toBe(false)

    // The rejection of the prerender pass's hanging promise stays within the
    // pass that created it, so nothing is reported to onRequestError either.
    const cliOutput = next.cliOutput.slice(cliOutputStart)
    expect(cliOutput).not.toContain('[instrumentation] onRequestError:')
  })
})
