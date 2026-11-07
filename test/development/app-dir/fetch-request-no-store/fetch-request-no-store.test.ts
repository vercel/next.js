import { nextTestSetup } from 'e2e-utils'
import { waitForNoErrorToast } from 'next-test-utils'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

describe('fetch-request-no-store', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let server: Server

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]))
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const { port } = server.address() as AddressInfo
    next.env.TEST_DATA_SERVER = `http://localhost:${port}/`
    await next.start()
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  // In dev, a `no-store` fetch waits for the dynamic stage, wherever its
  // cache mode is set.
  it.each([
    ['/init', 'in init'],
    ['/request', 'on the Request'],
    ['/request-and-init', 'in init, with a Request'],
  ])('holds the fetch of %s (cache mode %s)', async (pathname) => {
    const getCliOutput = next.getCliOutputFromHere()
    const browser = await next.browser(pathname)

    expect(await browser.elementByCss('#posts').text()).toMatch(
      /^3 posts at \d+$/
    )
    await waitForNoErrorToast(browser)
    expect(getCliOutput()).not.toInclude(
      'Next.js encountered the unstable value'
    )
  })
})
