import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'router autoscrolling on navigation with css modules',
  {
    files: __dirname,
  },
  ({ next }) => {
    type BrowserInterface = Awaited<ReturnType<(typeof next)['browser']>>

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

    describe('vertical scroll when page imports css modules', () => {
      it('should scroll to top of document when navigating between to pages without layout when', async () => {
        const browser: BrowserInterface = await next.browser('/1')

        await scrollTo(browser, { x: 0, y: 1000 })
        expect(await getTopScroll(browser)).toBe(1000)

        await browser.elementById('lower').click()
        await waitForScrollToComplete(browser, { x: 0, y: 0 })
      })

      it('should scroll when clicking in JS', async () => {
        const browser: BrowserInterface = await next.browser('/1')

        await scrollTo(browser, { x: 0, y: 1000 })
        expect(await getTopScroll(browser)).toBe(1000)

        await browser.eval(() => document.getElementById('lower').click())
        await waitForScrollToComplete(browser, { x: 0, y: 0 })
      })
    })
  }
)
