import { findPort } from 'next-test-utils'
import { isNextDeploy, isNextDev, nextTestSetup } from 'e2e-utils'
import { startExternalServer } from './external-server.mjs'

describe('middleware RSC external rewrite', () => {
  if (isNextDev || isNextDeploy) {
    test('should not run during dev or deploy test runs', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let externalServerManager: {
    cleanup: () => Promise<void>
    getReceivedRequests: () => any[]
  }

  beforeAll(async () => {
    const externalPort = await findPort()
    externalServerManager = await startExternalServer(externalPort)
    next.env.EXTERNAL_SERVER_PORT = String(externalPort)
    await next.start()
  })

  afterAll(async () => {
    await next.stop()
    await externalServerManager?.cleanup()
  })

  test('should forward _rsc parameter to external server on RSC navigation', async () => {
    const browser = await next.browser('/')

    try {
      const homeContent = await browser.elementById('home-content')
      expect(await homeContent.text()).toContain('This is the home page')

      const initialRequests = externalServerManager.getReceivedRequests()
      console.log('Initial requests before navigation:', initialRequests.length)

      const aboutLink = await browser.elementById('about-link')
      await aboutLink.click()

      await browser.waitForElementByCss('#external-response', 5000)

      const receivedRequests = externalServerManager.getReceivedRequests()
      console.log('Total requests received:', receivedRequests.length)
      console.log(
        'Received requests:',
        receivedRequests.map((r) => ({ url: r.url, method: r.method }))
      )

      const rscRequests = receivedRequests.filter((req) =>
        req.url.includes('_rsc=')
      )
      console.log(
        'RSC requests:',
        rscRequests.map((r) => r.url)
      )

      expect(rscRequests.length).toBeGreaterThan(0)

      const externalResponse = await browser.elementById('external-response')
      expect(await externalResponse.text()).toBe(
        'External server handled the request'
      )
    } finally {
      await browser.close()
    }
  })
})
