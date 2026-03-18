import webdriver from 'next-webdriver'
import { findPort, nextBuild, nextStart } from 'next-test-utils'
import { isNextDeploy, isNextDev } from 'e2e-utils'
import { startExternalServer } from './external-server.mjs'

describe('middleware RSC external rewrite', () => {
  if (isNextDev || isNextDeploy) {
    test('should not run during dev or deploy test runs', () => {})
    return
  }

  let cleanup: () => Promise<void>
  let nextPort: number
  let externalServerManager: {
    cleanup: () => Promise<void>
    getReceivedRequests: () => any[]
  }

  beforeAll(async () => {
    const appDir = __dirname
    await nextBuild(appDir, undefined, { cwd: appDir })

    // Start external server first
    const externalPort = await findPort()
    process.env.EXTERNAL_SERVER_PORT = externalPort.toString()
    externalServerManager = await startExternalServer(externalPort)

    // Start Next.js server
    nextPort = await findPort()
    const nextApp = await nextStart(appDir, nextPort, {
      env: {
        ...process.env,
        EXTERNAL_SERVER_PORT: externalPort.toString(),
      },
    })

    cleanup = async () => {
      await nextApp.kill()
      await externalServerManager.cleanup()
    }
  })

  afterAll(async () => {
    if (cleanup) {
      await cleanup()
    }
  })

  test('should forward _rsc parameter to external server on RSC navigation', async () => {
    let browser

    try {
      browser = await webdriver(nextPort, '/')

      // Verify we're on the home page
      const homeContent = await browser.elementById('home-content')
      expect(await homeContent.text()).toContain('This is the home page')

      // Clear any previous requests
      const initialRequests = externalServerManager.getReceivedRequests()
      console.log('Initial requests before navigation:', initialRequests.length)

      // Click the link to /about which should trigger RSC navigation
      const aboutLink = await browser.elementById('about-link')
      await aboutLink.click()

      // Wait a bit for the request to be processed
      await browser.waitForElementByCss('#external-response', 5000)

      // Check that external server received the request
      const receivedRequests = externalServerManager.getReceivedRequests()
      console.log('Total requests received:', receivedRequests.length)
      console.log(
        'Received requests:',
        receivedRequests.map((r) => ({ url: r.url, method: r.method }))
      )

      // Find requests that contain _rsc parameter
      const rscRequests = receivedRequests.filter((req) =>
        req.url.includes('_rsc=')
      )
      console.log(
        'RSC requests:',
        rscRequests.map((r) => r.url)
      )

      // Verify that at least one request contains the _rsc parameter
      expect(rscRequests.length).toBeGreaterThan(0)

      // Verify the external server response is displayed
      const externalResponse = await browser.elementById('external-response')
      expect(await externalResponse.text()).toBe(
        'External server handled the request'
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
