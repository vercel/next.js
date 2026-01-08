import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  retry,
  waitForNoRedbox,
  waitForRedbox,
} from 'next-test-utils'
import type { Page, Request } from 'playwright'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

describe('javascript-urls', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  /**
   * Creates a beforePageLoad handler that intercepts navigation requests
   * and tracks them for later assertion.
   */
  function createNavigationInterceptor() {
    const navigationRequests: Request[] = []

    const beforePageLoad = (page: Page) => {
      page.on('request', (request) => {
        if (request.resourceType() === 'document') {
          navigationRequests.push(request)
        }
      })
    }

    const getNavigationRequests = () => navigationRequests

    return { beforePageLoad, getNavigationRequests }
  }

  /**
   * Helper to test that a javascript: URL is blocked.
   * Waits for the security error to appear in logs (confirming the click was processed),
   * then asserts no navigation requests were made.
   */
  async function expectJavascriptUrlBlocked(
    browser: Awaited<ReturnType<typeof next.browser>>,
    initialUrl: string,
    getNavigationRequests: () => Request[]
  ) {
    const errorMessage =
      'has blocked a javascript: URL as a security precaution.'
    // Wait for the security error to appear in logs, confirming the click was processed
    await retry(async () => {
      const logs = await browser.log()
      const errors = logs.filter(
        (log) => log.source === 'error' && log.message.includes(errorMessage)
      )
      expect(errors.length).toBeGreaterThan(0)
    })

    // Verify no navigation requests were made after the initial page load
    const navRequests = getNavigationRequests()
    const postLoadNavigations = navRequests.filter(
      (req) => !req.url().includes(new URL(initialUrl).pathname)
    )
    expect(postLoadNavigations).toHaveLength(0)

    // Verify URL hasn't changed
    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl)
  }

  it('should prevent javascript URLs in link `href`', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/app/link-href', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('a').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in link `as`', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/app/link-as', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('a').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in route.push', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/app/router-push', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in route.replace', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/app/router-replace', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in route.prefetch', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/app/router-prefetch', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in server action redirect through onClick', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/app/action-redirect-onclick', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in server action redirect through form action', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/app/action-redirect-form', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  // React 18 did not block JavaScript URLs, it was just a console error.
  if (!isReact18) {
    it('should prevent javascript URLs in pages router Link component', async () => {
      const { beforePageLoad, getNavigationRequests } =
        createNavigationInterceptor()

      const browser = await next.browser('/pages/link-href', {
        pushErrorAsConsoleLog: true,
        beforePageLoad,
      })
      const initialUrl = await browser.url()

      await browser.elementByCss('a').click()

      await expectJavascriptUrlBlocked(
        browser,
        initialUrl,
        getNavigationRequests
      )

      if (isNextDev) {
        await waitForRedbox(browser)
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"React has blocked a javascript: URL as a security precaution."`
        )
        browser.keydown('Escape')
        await waitForNoRedbox(browser)
      }

      // Click the safe page link
      await browser.elementByCss('a[href="/pages/safe"]').click()

      // Wait for navigation to complete
      await browser.waitForCondition(
        'window.location.pathname.includes("/pages/safe")'
      )

      const safePageUrl = await browser.url()
      expect(safePageUrl).toContain('/pages/safe')
    })
  }

  it('should prevent javascript URLs in pages router Link as prop', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/pages/link-as', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('a').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    if (isNextDev) {
      await waitForRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"Next.js has blocked a javascript: URL as a security precaution."`
      )
      browser.keydown('Escape')
      await waitForNoRedbox(browser)
    }

    // Click the safe page link
    await browser.elementByCss('a[href="/pages/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/pages/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/pages/safe')
  })

  it('should prevent javascript URLs in pages router router.push', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/pages/router-push', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    if (isNextDev) {
      await waitForRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"Next.js has blocked a javascript: URL as a security precaution."`
      )
      browser.keydown('Escape')
      await waitForNoRedbox(browser)
    }

    // Click the safe page link
    await browser.elementByCss('a[href="/pages/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/pages/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/pages/safe')
  })

  it('should prevent javascript URLs in pages router router.replace', async () => {
    const { beforePageLoad, getNavigationRequests } =
      createNavigationInterceptor()

    const browser = await next.browser('/pages/router-replace', {
      pushErrorAsConsoleLog: true,
      beforePageLoad,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    await expectJavascriptUrlBlocked(browser, initialUrl, getNavigationRequests)

    if (isNextDev) {
      await waitForRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"Next.js has blocked a javascript: URL as a security precaution."`
      )
      browser.keydown('Escape')
      await waitForNoRedbox(browser)
    }

    // Click the safe page link
    await browser.elementByCss('a[href="/pages/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/pages/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/pages/safe')
  })
})
