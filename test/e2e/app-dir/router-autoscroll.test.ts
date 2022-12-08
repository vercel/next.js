import path from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { waitFor } from 'next-test-utils'

describe('router autoscrolling on navigation', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './router-autoscroll')),
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

  type BrowserInterface = Awaited<ReturnType<typeof webdriver>>
  const getRect = async (
    browser: BrowserInterface,
    id: string
  ): Promise<DOMRect> => {
    return JSON.parse(
      await browser.eval(
        'JSON.stringify(document.getElementById("page").getBoundingClientRect())'
      )
    )
  }

  const getTopScroll = async (browser: BrowserInterface) =>
    await browser.eval('document.documentElement.scrollTop')

  const getLeftScroll = async (browser: BrowserInterface) =>
    await browser.eval('document.documentElement.scrollLeft')

  const scrollTo = async (
    browser: BrowserInterface,
    options: { x: number; y: number }
  ) => {
    await browser.eval(`window.scrollTo(${options.x}, ${options.y})`)
  }

  const getBrowserDims = async (browser: BrowserInterface) => ({
    width: await browser.eval<number>('document.documentElement.clientWidth'),
    height: await browser.eval<number>('document.documentElement.clientHeight'),
  })

  describe('vertical scroll', () => {
    it('should scroll to top of document when navigating between to pages without layout', async () => {
      const browser = await webdriver(next.url, '/0/0/100/10000/page1')

      expect(await getTopScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 0, y: 1000 })
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(1000)

      await browser.eval(`window.router.push("/0/0/100/10000/page2")`)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(0)

      browser.quit()
    })

    it("should scroll to top of page when scrolling to phe top of the document wouldn't have the page in the viewport", async () => {
      const browser = await webdriver(next.url, '/0/1000/100/1000/page1')
      expect(await getTopScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 0, y: 1500 })
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(1500)

      await browser.eval(`window.router.push("/0/1000/100/1000/page2")`)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(1000)

      browser.quit()
    })

    it("should scroll down to the navigated page when it's below viewort", async () => {
      const browser = await webdriver(next.url, '/0/1000/100/1000/page1')
      expect(await getTopScroll(browser)).toBe(0)

      await browser.eval(`window.router.push("/0/1000/100/1000/page2")`)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(1000)

      browser.quit()
    })

    it('should not scroll when the top of the page is in the viewport', async () => {
      const browser = await webdriver(next.url, '/10/1000/100/1000/page1')
      expect(await getTopScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 0, y: 800 })
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(800)

      await browser.eval(`window.router.push("/10/1000/100/1000/page2")`)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(800)

      browser.quit()
    })
  })

  /**
   * scrollIntoView() has a bit different behavior when scrolling horizontally.
   * It will scroll the least ammount to git the item into viewport, it will not try to allign it with start of the container.
   */
  describe('horizontal scroll', () => {
    it("shouldn't scroll to left of document when navigating between to pages and the page is visible", async () => {
      const browser = await webdriver(next.url, '/0/0/10000/100/page1')

      expect(await getLeftScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 1000, y: 0 })
      await waitFor(100)

      expect(await getLeftScroll(browser)).toBe(1000)

      await browser.eval(`window.router.push("/0/0/10000/100/page2")`)
      await waitFor(100)

      expect(await getLeftScroll(browser)).toBe(1000)

      browser.quit()
    })

    it("should scroll right to the navigated page when it's to the right of viewort", async () => {
      const browser = await webdriver(next.url, '/10000/0/10000/100/page1')
      expect(await getLeftScroll(browser)).toBe(0)

      await browser.eval(`window.router.push("/10000/0/10000/100/page2")`)
      await waitFor(100)

      expect(await getLeftScroll(browser)).toBe(10000)

      browser.quit()
    })

    it("should scroll to get the navigated page into viewport when it's to the left of viewort", async () => {
      const browser = await webdriver(next.url, '/10000/0/10000/100/page1')
      expect(await getLeftScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 21000, y: 0 })
      await waitFor(100)

      expect(await getLeftScroll(browser)).toBe(21000)

      await browser.eval(`window.router.push("/10000/0/10000/100/page2")`)
      await waitFor(100)

      // It will align right edge of page because it's closer
      expect(await getLeftScroll(browser)).toBe(20000 - 1280)

      browser.quit()
    })
  })

  describe('router.refresh()', () => {
    it('should not scroll when called alone', async () => {
      const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

      expect(await getTopScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 0, y: 12000 })
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(12000)

      await browser.eval(`window.router.refresh()`)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(12000)

      browser.quit()
    })

    // TODO fix next js to past this
    it.skip('should not stop router.push() from scrolling', async () => {
      const browser = await webdriver(next.url, '/10/10000/100/1000/page1')

      expect(await getTopScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 0, y: 12000 })
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(12000)

      await browser.eval(`
        window.React.startTransition(() => {
          window.router.push('/10/10000/100/1000/page2')
          window.router.refresh()
        })
      `)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(10000)

      browser.quit()
    })
  })
})
