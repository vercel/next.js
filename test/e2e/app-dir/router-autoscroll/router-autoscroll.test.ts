import webdriver from 'next-webdriver'
import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'router autoscrolling on navigation',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    type BrowserInterface = Awaited<ReturnType<typeof webdriver>>

    const getTopScroll = async (browser: BrowserInterface) =>
      await browser.eval('document.documentElement.scrollTop')

    const getLeftScroll = async (browser: BrowserInterface) =>
      await browser.eval('document.documentElement.scrollLeft')

    const waitForScrollToComplete = (
      browser,
      options: { x: number; y: number }
    ) =>
      check(async () => {
        const top = await getTopScroll(browser)
        const left = await getLeftScroll(browser)
        return top === options.y && left === options.x
          ? 'success'
          : JSON.stringify({ top, left })
      }, 'success')

    const scrollTo = async (
      browser: BrowserInterface,
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
      ;((global as any).isDev ? it : it.skip)(
        'should not scroll the page when we hot reload',
        async () => {
          const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

          await scrollTo(browser, { x: 0, y: 12000 })

          const pagePath =
            'app/[layoutPaddingWidth]/[layoutPaddingHeight]/[pageWidth]/[pageHeight]/[param]/page.tsx'

          await browser.eval(`window.router.refresh()`)
          await next.patchFile(
            pagePath,
            (await next.readFile(pagePath)) +
              `
        \\\\ Add this meaningless comment to force refresh
        `
          )
          await waitForScrollToComplete(browser, { x: 0, y: 12000 })
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
    })
  }
)
