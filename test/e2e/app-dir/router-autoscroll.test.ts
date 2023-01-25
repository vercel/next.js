import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { waitFor } from 'next-test-utils'

describe('router autoscrolling on navigation', () => {
  let next: NextInstance

  const filesPath = path.join(__dirname, './router-autoscroll')
  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(filesPath),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        typescript: 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  const isReact17 = process.env.NEXT_TEST_REACT_VERSION === '^17'
  if (isReact17) {
    it('should skip tests for react 17', () => {})
    return
  }

  /** These is no clear API so we just wait a really long time to avoid flakiness */
  const waitForScrollToComplete = () => waitFor(1000)

  type BrowserInterface = Awaited<ReturnType<typeof webdriver>>

  const getTopScroll = async (browser: BrowserInterface) =>
    await browser.eval('document.documentElement.scrollTop')

  const getLeftScroll = async (browser: BrowserInterface) =>
    await browser.eval('document.documentElement.scrollLeft')

  const scrollTo = async (
    browser: BrowserInterface,
    options: { x: number; y: number }
  ) => {
    await browser.eval(`window.scrollTo(${options.x}, ${options.y})`)
    await waitForScrollToComplete()
  }

  describe('vertical scroll', () => {
    it('should scroll to top of document when navigating between to pages without layout', async () => {
      const browser = await webdriver(next.url, '/0/0/100/10000/page1')

      await scrollTo(browser, { x: 0, y: 1000 })
      expect(await getTopScroll(browser)).toBe(1000)

      await browser.eval(`window.router.push("/0/0/100/10000/page2")`)
      await waitForScrollToComplete()

      expect(await getTopScroll(browser)).toBe(0)

      browser.quit()
    })

    it("should scroll to top of page when scrolling to phe top of the document wouldn't have the page in the viewport", async () => {
      const browser = await webdriver(next.url, '/0/1000/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 1500 })
      expect(await getTopScroll(browser)).toBe(1500)

      await browser.eval(`window.router.push("/0/1000/100/1000/page2")`)
      await waitForScrollToComplete()

      expect(await getTopScroll(browser)).toBe(1000)

      browser.quit()
    })

    it("should scroll down to the navigated page when it's below viewort", async () => {
      const browser = await webdriver(next.url, '/0/1000/100/1000/page1')
      expect(await getTopScroll(browser)).toBe(0)

      await browser.eval(`window.router.push("/0/1000/100/1000/page2")`)
      await waitForScrollToComplete()

      expect(await getTopScroll(browser)).toBe(1000)

      browser.quit()
    })

    it('should not scroll when the top of the page is in the viewport', async () => {
      const browser = await webdriver(next.url, '/10/1000/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 800 })
      expect(await getTopScroll(browser)).toBe(800)

      await browser.eval(`window.router.push("/10/1000/100/1000/page2")`)
      await waitForScrollToComplete()

      expect(await getTopScroll(browser)).toBe(800)

      browser.quit()
    })

    it('should not scroll to top of document if page in viewport', async () => {
      const browser = await webdriver(next.url, '/10/100/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 50 })
      expect(await getTopScroll(browser)).toBe(50)

      await browser.eval(`window.router.push("/10/100/100/1000/page2")`)
      await waitForScrollToComplete()

      expect(await getTopScroll(browser)).toBe(50)

      browser.quit()
    })

    it('should scroll to top of document if possible while giving focus to page', async () => {
      const browser = await webdriver(next.url, '/10/100/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 200 })
      expect(await getTopScroll(browser)).toBe(200)

      await browser.eval(`window.router.push("/10/100/100/1000/page2")`)
      await waitForScrollToComplete()

      expect(await getTopScroll(browser)).toBe(0)

      browser.quit()
    })
  })

  describe('horizontal scroll', () => {
    it("should't scroll horizontally", async () => {
      const browser = await webdriver(next.url, '/0/0/10000/10000/page1')

      await scrollTo(browser, { x: 1000, y: 1000 })
      expect(await getLeftScroll(browser)).toBe(1000)
      expect(await getTopScroll(browser)).toBe(1000)

      await browser.eval(`window.router.push("/0/0/10000/10000/page2")`)
      await waitForScrollToComplete()

      expect(await getLeftScroll(browser)).toBe(1000)
      expect(await getTopScroll(browser)).toBe(0)

      browser.quit()
    })
  })

  describe('router.refresh()', () => {
    it('should not scroll when called alone', async () => {
      const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 12000 })
      expect(await getTopScroll(browser)).toBe(12000)

      await browser.eval(`window.router.refresh()`)
      await waitForScrollToComplete()

      expect(await getTopScroll(browser)).toBe(12000)

      browser.quit()
    })

    // TODO fix next js to pass this
    it.skip('should not stop router.push() from scrolling', async () => {
      const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

      await scrollTo(browser, { x: 0, y: 12000 })
      expect(await getTopScroll(browser)).toBe(12000)

      await browser.eval(`
        window.React.startTransition(() => {
          window.router.push('/10/10000/100/1000/page2')
          window.router.refresh()
        })
      `)
      await waitForScrollToComplete()

      expect(await getTopScroll(browser)).toBe(10000)

      browser.quit()
    })

    // Test hot reloading only in development
    ;((global as any).isDev ? it : it.skip)(
      'should not scroll the page when we hot reload',
      async () => {
        const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

        await scrollTo(browser, { x: 0, y: 12000 })
        expect(await getTopScroll(browser)).toBe(12000)

        const pagePath =
          'app/[layoutPaddingWidth]/[layoutPaddingHeight]/[pageWidth]/[pageHeight]/[param]/page.tsx'

        await browser.eval(`window.router.refresh()`)
        await next.patchFile(
          pagePath,
          fs.readFileSync(path.join(filesPath, pagePath)).toString() +
            `
        \\\\ Add this meaningless comment to force refresh
        `
        )
        await waitFor(1000)

        expect(await getTopScroll(browser)).toBe(12000)

        browser.quit()
      }
    )
  })
})
