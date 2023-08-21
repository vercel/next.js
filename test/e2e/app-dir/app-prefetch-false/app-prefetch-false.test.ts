import type { Request } from 'playwright-core'

import { createNextDescribe } from 'e2e-utils'
import type { BrowserInterface } from '../../../lib/browsers/base'

const getPathname = (url: string) => {
  const urlObj = new URL(url)
  return urlObj.pathname
}

const createRequestsListener = async (browser: BrowserInterface) => {
  // wait for network idle
  await browser.waitForIdleNetwork()

  let requests = []

  browser.on('request', (req: Request) => {
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

createNextDescribe(
  'app-prefetch-false',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    if (isNextDev) {
      it.skip('should skip test in dev mode', () => {})
    } else {
      it('should avoid double-fetching when optimistic navigation fails', async () => {
        const browser = await next.browser('/foo')
        const { getRequests } = await createRequestsListener(browser)

        await browser.elementByCss('[href="/foo"]').click()
        await browser.elementByCss('[href="/foo/bar"]').click()
        console.log('getRequests()', getRequests())
        expect(
          getRequests().filter(([req]) => getPathname(req) === '/foo/bar')
            .length
        ).toBe(1)
      })
    }
  }
)
