import webdriver, { type Playwright } from 'next-webdriver'
import { nextTestSetup } from 'e2e-utils'
import { check, assertNoConsoleErrors, retry } from 'next-test-utils'

describe('router autoscrolling on navigation', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  const getTopScroll = async (browser: Playwright) =>
    await browser.eval('document.documentElement.scrollTop')

  const getLeftScroll = async (browser: Playwright) =>
    await browser.eval('document.documentElement.scrollLeft')

  const waitForScrollToComplete = async (
    browser: Playwright,
    options: { x: number; y: number }
  ) => {
    await retry(async () => {
      const top = await getTopScroll(browser)
      const left = await getLeftScroll(browser)
      expect({ top, left }).toEqual({ top: options.y, left: options.x })
    })
    await assertNoConsoleErrors(browser)
  }

  const scrollTo = async (
    browser: Playwright,
    options: { x: number; y: number }
  ) => {
    await browser.eval(`window.scrollTo(${options.x}, ${options.y})`)
    await waitForScrollToComplete(browser, options)
  }

  describe('vertical scroll', () => {
    it('should scroll to top of document when navigating between to pages without layout', async () => {
      const browser = await webdriver(next.url, '/0/0/100/10000/page1')

      await scrollTo(browser, { x: 0, y: 1000 })
      expect(await getTopScroll(browser)).toBe(1000)

      await browser.eval(`window.router.push("/0/0/100/10000/page2")`)
      await waitForScrollToComplete(browser, { x: 0, y: 0 })
    })

    it("should scroll to top of page when scrolling to phe top of the document wouldn't have the page in the viewport", async () => {
      const browser = await webdriver(next.url, '/0/1000/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 1500 })
      expect(await getTopScroll(browser)).toBe(1500)

      await browser.eval(`window.router.push("/0/1000/100/1000/page2")`)
      await waitForScrollToComplete(browser, { x: 0, y: 1000 })
    })

    it("should scroll down to the navigated page when it's below viewort", async () => {
      const browser = await webdriver(next.url, '/0/1000/100/1000/page1')
      expect(await getTopScroll(browser)).toBe(0)

      await browser.eval(`window.router.push("/0/1000/100/1000/page2")`)
      await waitForScrollToComplete(browser, { x: 0, y: 1000 })
    })

    it('should not scroll when the top of the page is in the viewport', async () => {
      const browser = await webdriver(next.url, '/10/1000/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 800 })
      expect(await getTopScroll(browser)).toBe(800)

      await browser.eval(`window.router.push("/10/1000/100/1000/page2")`)
      await waitForScrollToComplete(browser, { x: 0, y: 800 })
    })

    it('should not scroll to top of document if page in viewport', async () => {
      const browser = await webdriver(next.url, '/10/100/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 50 })
      expect(await getTopScroll(browser)).toBe(50)

      await browser.eval(`window.router.push("/10/100/100/1000/page2")`)
      await waitForScrollToComplete(browser, { x: 0, y: 50 })
    })

    it('should scroll to top of document if possible while giving focus to page', async () => {
      const browser = await webdriver(next.url, '/10/100/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 200 })
      expect(await getTopScroll(browser)).toBe(200)

      await browser.eval(`window.router.push("/10/100/100/1000/page2")`)
      await waitForScrollToComplete(browser, { x: 0, y: 0 })
    })

    it('should scroll to top of document with new metadata', async () => {
      const browser = await webdriver(next.url, '/')

      // scroll to bottom
      await browser.eval(
        `window.scrollTo(0, ${await browser.eval('document.documentElement.scrollHeight')})`
      )
      // Just need to scroll by something
      expect(await getTopScroll(browser)).toBeGreaterThan(0)

      await browser.elementByCss('[href="/new-metadata"]').click()
      expect(
        await browser.eval('document.documentElement.scrollHeight')
      ).toBeGreaterThan(0)
      await waitForScrollToComplete(browser, { x: 0, y: 0 })
    })
  })

  describe('horizontal scroll', () => {
    it("should't scroll horizontally", async () => {
      const browser = await webdriver(next.url, '/0/0/10000/10000/page1')

      await scrollTo(browser, { x: 1000, y: 1000 })
      expect(await getLeftScroll(browser)).toBe(1000)
      expect(await getTopScroll(browser)).toBe(1000)

      await browser.eval(`window.router.push("/0/0/10000/10000/page2")`)
      await waitForScrollToComplete(browser, { x: 1000, y: 0 })
    })
  })

  describe('router.refresh()', () => {
    it('should not scroll when called alone', async () => {
      const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 12000 })
      expect(await getTopScroll(browser)).toBe(12000)

      await browser.eval(`window.router.refresh()`)
      await waitForScrollToComplete(browser, { x: 0, y: 12000 })
    })

    it('should not stop router.push() from scrolling', async () => {
      const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 12000 })
      expect(await getTopScroll(browser)).toBe(12000)

      await browser.eval(`
      window.React.startTransition(() => {
        window.router.push('/10/10000/100/1000/page2')
        window.router.refresh()
      })
    `)
      await waitForScrollToComplete(browser, { x: 0, y: 10000 })
      browser.close()
    })

    // Test hot reloading only in development
    ;(isNextDev ? it : it.skip)(
      'should not scroll the page when we hot reload',
      async () => {
        const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

        await scrollTo(browser, { x: 0, y: 12000 })

        const pagePath =
          'app/[layoutPaddingWidth]/[layoutPaddingHeight]/[pageWidth]/[pageHeight]/[param]/page.tsx'

        await browser.eval(`window.router.refresh()`)
        let originalContent: string
        await next.patchFile(pagePath, (content) => {
          originalContent = content
          return (
            content +
            `
      // Add this meaningless comment to force refresh
      `
          )
        })
        await waitForScrollToComplete(browser, { x: 0, y: 12000 })
        await next.patchFile(pagePath, originalContent)
      }
    )
  })

  describe('bugs', () => {
    it('Should scroll to the top of the layout when the first child is display none', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.eval('window.scrollTo(0, 500)')
      await browser
        .elementByCss('#to-invisible-first-element')
        .click()
        .waitForElementByCss('#content-that-is-visible')
      await check(() => browser.eval('window.scrollY'), 0)
    })

    it('Should scroll to the top of the layout when the first child is position fixed', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.eval('window.scrollTo(0, 500)')
      await browser
        .elementByCss('#to-fixed-first-element')
        .click()
        .waitForElementByCss('#content-that-is-visible')
      await check(() => browser.eval('window.scrollY'), 0)

      if (isNextDev) {
        // Check that we've logged a warning
        await check(async () => {
          const logs = await browser.log()
          return logs.some((log) =>
            log.message.includes(
              'Skipping auto-scroll behavior due to `position: sticky` or `position: fixed` on element:'
            )
          )
            ? 'success'
            : undefined
        }, 'success')
      }
    })

    it('Should scroll to the top of the layout when the first child is position sticky', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.eval('window.scrollTo(0, 500)')
      await browser
        .elementByCss('#to-sticky-first-element')
        .click()
        .waitForElementByCss('#content-that-is-visible')
      await check(() => browser.eval('window.scrollY'), 0)

      if (isNextDev) {
        // Check that we've logged a warning
        await check(async () => {
          const logs = await browser.log()
          return logs.some((log) =>
            log.message.includes(
              'Skipping auto-scroll behavior due to `position: sticky` or `position: fixed` on element:'
            )
          )
            ? 'success'
            : undefined
        }, 'success')
      }
    })

    it('Should apply scroll when loading.js is used', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.eval('window.scrollTo(0, 500)')
      await browser
        .elementByCss('#to-loading-scroll')
        .click()
        .waitForElementByCss('#loading-component')
      await check(() => browser.eval('window.scrollY'), 0)
      await browser.waitForElementByCss('#content-that-is-visible')
      await check(() => browser.eval('window.scrollY'), 0)
    })

    it('should scroll to top when navigating to same page with different search params', async () => {
      const browser = await next.browser('/loading-scroll?skipSleep=1')

      await retry(async () => {
        // scroll to the links at the bottom of the page
        await browser.eval(`document.getElementById("pages").scrollIntoView()`)

        // grab the current scroll position
        const scrollY = await browser.eval(`window.scrollY`)

        // sanity check: we should not be scrolled to the top
        expect(scrollY).not.toBe(0)
      })

      // click a link
      await browser.elementByCss("a[href='?page=2&skipSleep=1']").click()

      // assert the new page id has been committed
      expect(await browser.elementById('current-page').text()).toBe('2')

      await retry(async () => {
        // we should have scrolled to the top
        expect(await browser.eval(`window.scrollY`)).toBe(0)
      })
    })
  })
})
