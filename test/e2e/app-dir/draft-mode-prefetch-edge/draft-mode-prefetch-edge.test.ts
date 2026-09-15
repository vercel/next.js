import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

// @force-gate prefetching
describe('draft-mode-prefetch-edge', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let browserForCleanup: Awaited<ReturnType<typeof next.browser>> | undefined
  afterEach(async () => {
    if (browserForCleanup !== undefined) {
      await browserForCleanup.deleteCookies()
      browserForCleanup = undefined
    }
  })

  async function startBrowser(url: string) {
    let act: ReturnType<typeof createRouterAct> | undefined
    const browser = await next.browser(url, {
      beforePageLoad(page) {
        act = createRouterAct(page, { includeAppShellRequests: true })
      },
    })
    browserForCleanup = browser
    if (act === undefined) {
      throw new Error('Router act was not initialized')
    }
    await browser.eval('window.__testDocument = "retained"')
    return { browser, act }
  }

  describe.each([
    {
      name: 'initial document',
      pathname: '/',
      enablePathname: '/draft',
      heading: 'Edge page',
    },
    {
      name: 'initial error document',
      pathname: '/error',
      enablePathname: '/draft?error',
      heading: 'Edge global error',
    },
  ])('$name', ({ pathname, enablePathname, heading }) => {
    it('prefetches automatic and full Links when draft mode is disabled', async () => {
      const { browser, act } = await startBrowser(pathname)
      expect(await browser.elementByCss('h1').text()).toBe(heading)
      if (pathname === '/') {
        expect(await browser.elementById('draft-mode').text()).toBe(
          'Draft mode: disabled'
        )
      }

      await act(async () => {
        await browser
          .elementByCss('input[data-link-accordion="/article/auto"]')
          .click()
      })
      await act(
        async () => {
          await browser
            .elementByCss('input[data-link-accordion="/article/full"]')
            .click()
        },
        { includes: 'Published content: full' }
      )
    })

    it('suppresses draft-mode prefetches and hover without preventing SPA navigation', async () => {
      const { browser, act } = await startBrowser(enablePathname)
      expect(new URL(await browser.url()).pathname).toBe(pathname)
      expect(await browser.elementByCss('h1').text()).toBe(heading)
      if (pathname === '/') {
        expect(await browser.elementById('draft-mode').text()).toBe(
          'Draft mode: enabled'
        )
      }

      for (const target of ['auto', 'full']) {
        await act(async () => {
          await browser
            .elementByCss(`input[data-link-accordion="/article/${target}"]`)
            .click()
        }, 'no-requests')
        await act(async () => {
          await browser.locator(`a[href="/article/${target}"]`).hover()
        }, 'no-requests')
      }

      await act(
        async () => {
          await browser.elementByCss('a[href="/article/full"]').click()
        },
        { includes: 'Draft content: full' }
      )
      expect(await browser.elementById('target-content').text()).toBe(
        'Draft content: full'
      )
      expect(await browser.eval('window.__testDocument')).toBe('retained')
    })
  })
})
