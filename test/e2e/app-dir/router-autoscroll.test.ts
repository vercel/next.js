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
    it('should scroll to top when navigating between to pages without layout', async () => {
      const browser = await webdriver(next.url, '/0/0/100/10000/page1')

      expect(await getTopScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 0, y: 1000 })
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(1000)

      await browser.eval(`window.navigate("/0/0/100/10000/page2")`)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(0)

      browser.quit()
    })

    it("should scroll to top of page when scrolling wouldn't have the page in the viewport", async () => {
      const browser = await webdriver(next.url, '/0/1000/100/1000/page1')
      expect(await getTopScroll(browser)).toBe(0)

      await scrollTo(browser, { x: 0, y: 1500 })
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(1500)

      await browser.eval(`window.navigate("/0/1000/100/1000/page2")`)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(1000)

      browser.quit()
    })

    it("should scroll down to the navigated page when it's below viewort", async () => {
      const browser = await webdriver(next.url, '/0/1000/100/1000/page1')
      expect(await getTopScroll(browser)).toBe(0)

      await browser.eval(`window.navigate("/0/1000/100/1000/page2")`)
      await waitFor(100)

      expect(await getTopScroll(browser)).toBe(1000)

      browser.quit()
    })
  })
})
