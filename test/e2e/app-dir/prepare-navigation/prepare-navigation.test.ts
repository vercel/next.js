import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'

// @force-gate prepareNavigation
describe('router.experimental_prepare', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The warning is development-only.
  // @force-gate dev
  it('warns when a prepared navigation is committed more than once', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('button[data-prepare="/target"]').click()
    await browser.elementByCss('button[data-commit-push="/target"]').click()
    await browser.waitForElementByCss('#target-dynamic')

    await browser.elementByCss('button[data-commit-push="/target"]').click()
    await retry(async () => {
      const logs = await browser.log()
      expect(logs.map((log) => log.message).join('\n')).toContain(
        'The prepared navigation to "/target" was already committed.'
      )
    })
  })

  // These tests assert on router requests, including prefetches.
  // @force-gate prefetching
  describe('requests', () => {
    async function startBrowser() {
      let page!: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)
      return { browser, act }
    }

    type Browser = Awaited<ReturnType<typeof startBrowser>>['browser']
    type Act = Awaited<ReturnType<typeof startBrowser>>['act']

    async function getPathname(browser: Browser) {
      return new URL(await browser.url()).pathname
    }

    async function getHistoryLength(browser: Browser): Promise<number> {
      return browser.eval('window.history.length')
    }

    async function click(browser: Browser, selector: string) {
      await (await browser.elementByCss(selector)).click()
    }

    // Prefetch the /target route, so the router knows its route tree.
    async function prefetchTarget(browser: Browser, act: Act) {
      await act(
        async () => {
          await click(browser, 'input[data-link-accordion="/target"]')
          await browser.elementByCss('a[href="/target"]')
        },
        { includes: 'Target page' }
      )
      // Hide the link again so it can't trigger more prefetches.
      await click(browser, 'input[data-link-accordion="/target"]')
    }

    async function prepareTarget(browser: Browser, act: Act) {
      await act(() => click(browser, 'button[data-prepare="/target"]'), {
        includes: 'Dynamic content for /target',
      })
    }

    async function expectTargetRendered(browser: Browser) {
      expect(
        await (await browser.waitForElementByCss('#target-dynamic')).text()
      ).toBe('Dynamic content for /target')
      expect(await getPathname(browser)).toBe('/target')
    }

    it('preparing a navigation does not navigate', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      const historyLength = await getHistoryLength(browser)

      await prepareTarget(browser, act)

      expect(await getPathname(browser)).toBe('/')
      expect(await browser.elementById('hub-a').text()).toBe('Hub A')
      expect(await browser.hasElementByCss('#target-shell')).toBe(false)
      expect(await getHistoryLength(browser)).toBe(historyLength)
    })

    it('committing with push reuses the prepared data', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      const historyLength = await getHistoryLength(browser)
      await prepareTarget(browser, act)

      // The dynamic stale time is 0, so a regular navigation would refetch the
      // page. The commit reuses the prepared data regardless.
      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
      expect(await getHistoryLength(browser)).toBe(historyLength + 1)
    })

    it('committing with replace reuses the prepared data', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      const historyLength = await getHistoryLength(browser)
      await prepareTarget(browser, act)

      await act(
        () => click(browser, 'button[data-commit-replace="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
      expect(await getHistoryLength(browser)).toBe(historyLength)
    })

    it('committing while the prepared request is in flight reuses it', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)

      // Clicking fires pointerdown (prepare) and then click (commit) in the same
      // scope. `act` withholds responses until the scope exits, so the commit
      // happens before the prepared response arrives. If the commit issued its
      // own request, the dynamic content would appear in two responses, which
      // fails the assertion.
      await act(() => click(browser, 'a[data-prepare-link="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('committing while the prepared request is in flight reuses it, for a route that was not prefetched', async () => {
      const { browser, act } = await startBrowser()

      // Same as above, except the router doesn't know the route yet, so
      // nothing is in the BFCache when the commit starts. The commit takes
      // over the prepared request instead.
      await act(() => click(browser, 'a[data-prepare-link="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('a refresh while preparing a route that was not prefetched invalidates the prepared data', async () => {
      const { browser, act } = await startBrowser()

      // The refresh happens before the prepared response arrives.
      await act(
        async () => {
          await click(browser, 'button[data-prepare="/target"]')
          await click(browser, 'button[data-refresh]')
        },
        { includes: 'Hub A' }
      )

      await act(() => click(browser, 'button[data-commit-push="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('committing a navigation to a route that was not prefetched', async () => {
      const { browser, act } = await startBrowser()

      // Without a prefetch, preparing the navigation also discovers the route.
      await prepareTarget(browser, act)
      expect(await getPathname(browser)).toBe('/')

      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
    })

    it('a regular navigation does not reuse prepared data', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      await prepareTarget(browser, act)

      // Only the commit ignores the stale time. A regular navigation to the
      // same route refetches the stale data.
      await act(() => click(browser, 'button[data-push="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('a refresh between prepare and commit invalidates the prepared data', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      await prepareTarget(browser, act)

      await act(() => click(browser, 'button[data-refresh]'), {
        includes: 'Hub A',
      })

      await act(() => click(browser, 'button[data-commit-push="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('can commit after navigating elsewhere', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      await prepareTarget(browser, act)

      await act(() => click(browser, 'button[data-push="/hub-b"]'), {
        includes: 'Hub B',
      })
      expect(await browser.elementById('hub-b').text()).toBe('Hub B')

      // The prepared segments are keyed by their own route, not by the page the
      // navigation was prepared from, so they're still reused.
      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
    })

    it('a prepared navigation that redirects does not navigate', async () => {
      const { browser, act } = await startBrowser()
      const historyLength = await getHistoryLength(browser)

      // The redirect is followed, so there's no target content to match on;
      // only assert that the request was made.
      await act(() => click(browser, 'button[data-prepare="/redirect-target"]'))

      expect(await getPathname(browser)).toBe('/')
      expect(await browser.elementById('hub-a').text()).toBe('Hub A')
      expect(await getHistoryLength(browser)).toBe(historyLength)
    })

    it('committing a prepared navigation more than once has no effect', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      const historyLength = await getHistoryLength(browser)
      await prepareTarget(browser, act)

      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )
      await expectTargetRendered(browser)
      expect(await getHistoryLength(browser)).toBe(historyLength + 1)

      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )
      await act(
        () => click(browser, 'button[data-commit-replace="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
      expect(await getHistoryLength(browser)).toBe(historyLength + 1)
    })
  })
})
