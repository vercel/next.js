import { nextTestSetup } from 'e2e-utils'
import type { Playwright } from 'next-webdriver'

const getPathname = (url: string) => {
  const urlObj = new URL(url)
  return urlObj.pathname
}

const createRequestsListener = async (browser: Playwright) => {
  // wait for network idle
  await browser.waitForIdleNetwork()

  let requests = []

  browser.on('request', (req) => {
    requests.push([req.url(), !!req.headers()['next-router-prefetch']])
  })

  await browser.refresh()

  return {
    getRequests: () => requests,
    clearRequests: () => {
      requests = []
    },
  }
}

describe('app-prefetch-false', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it.skip('should skip test in development mode', () => {})
  } else {
    it('should avoid double-fetching when optimistic navigation fails', async () => {
      const browser = await next.browser('/foo')
      const { getRequests } = await createRequestsListener(browser)

      await browser.elementByCss('[href="/foo"]').click()
      await browser.elementByCss('[href="/foo/bar"]').click()
      console.log('getRequests()', getRequests())
      expect(
        getRequests().filter(([req]) => getPathname(req) === '/foo/bar').length
      ).toBe(1)
    })
  }
})
