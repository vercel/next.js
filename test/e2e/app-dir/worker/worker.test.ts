import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { Page } from 'playwright'

describe('app dir - workers', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  function beforePageLoad(page: Page) {
    page.on('request', (request) => {
      const url = request.url()
      // TODO fix deployment id for webpack
      if (isTurbopack) {
        if (url.includes('/_next/') && !url.includes('wasm')) {
          expect(url).toMatch(/^[^?]+\?(v=\d+&)?dpl=test-deployment-id$/)
        }
      }
    })
  }

  it('should support web workers with dynamic imports', async () => {
    const browser = await next.browser('/classic', {
      beforePageLoad,
    })
    expect(await browser.elementByCss('#worker-state').text()).toBe('default')

    await browser.elementByCss('button').click()

    await retry(async () =>
      expect(await browser.elementByCss('#worker-state').text()).toBe(
        'worker.ts:worker-dep'
      )
    )
  })

  it('should support module web workers with dynamic imports', async () => {
    const browser = await next.browser('/module', {
      beforePageLoad,
    })
    expect(await browser.elementByCss('#worker-state').text()).toBe('default')

    await browser.elementByCss('button').click()

    await retry(async () =>
      expect(await browser.elementByCss('#worker-state').text()).toBe(
        'worker.ts:worker-dep'
      )
    )
  })

  it('should not bundle web workers with string specifiers', async () => {
    const browser = await next.browser('/string', {
      beforePageLoad,
    })
    expect(await browser.elementByCss('#worker-state').text()).toBe('default')

    await browser.elementByCss('button').click()

    await retry(async () =>
      expect(await browser.elementByCss('#worker-state').text()).toBe(
        'unbundled-worker'
      )
    )
  })

  it('should have access to NEXT_DEPLOYMENT_ID in web worker', async () => {
    const browser = await next.browser('/deployment-id', {
      beforePageLoad,
    })

    // Verify main thread has deployment ID and it's not empty
    const mainDeploymentId = await browser
      .elementByCss('#main-deployment-id')
      .text()
    expect(mainDeploymentId).toBe('test-deployment-id')

    // Initial worker state should be default
    expect(await browser.elementByCss('#worker-deployment-id').text()).toBe(
      'default'
    )

    // Trigger worker to get deployment ID
    await browser.elementByCss('button').click()

    // Wait for worker to respond and verify it matches main thread
    await retry(async () => {
      const workerDeploymentId = await browser
        .elementByCss('#worker-deployment-id')
        .text()
      expect(workerDeploymentId).toBe('test-deployment-id')
    })
  })

  it('should support loading WASM files in workers', async () => {
    const browser = await next.browser('/wasm', {
      beforePageLoad,
    })
    expect(await browser.elementByCss('#worker-state').text()).toBe('default')

    await browser.elementByCss('button').click()

    // The WASM add_one(41) should return 42
    await retry(async () =>
      expect(await browser.elementByCss('#worker-state').text()).toBe(
        'result:42'
      )
    )
  })

  it('should support shared workers', async () => {
    if (!isTurbopack) {
      // webpack requires a magic attribute for shared workers to function
      return
    }
    const browser = await next.browser('/shared', {
      beforePageLoad,
    })
    expect(await browser.elementByCss('#worker-state').text()).toBe('default')

    await browser.elementByCss('button').click()

    await retry(async () =>
      expect(await browser.elementByCss('#worker-state').text()).toBe(
        'shared-worker.ts:worker-dep:2'
      )
    )
  })

  it('should support loading PNG files in web workers', async () => {
    const browser = await next.browser('/png', {
      beforePageLoad,
    })
    // Initial state should be default
    expect(await browser.elementByCss('#png-url').text()).toBe('default')

    // Trigger worker to get PNG info
    await browser.elementByCss('button').click()

    // Wait for worker to respond and verify PNG info
    await retry(async () => {
      const pngUrl = await browser.elementByCss('#png-url').text()
      expect(pngUrl).toContain('test-image')
      expect(pngUrl).toContain('.png')
    })

    await retry(async () => {
      const pngWidth = await browser.elementByCss('#png-width').text()
      expect(pngWidth).toBe('1')
    })

    await retry(async () => {
      const pngHeight = await browser.elementByCss('#png-height').text()
      expect(pngHeight).toBe('1')
    })

    // Verify the worker actually fetched the PNG (proves asset URL works in worker)
    await retry(async () => {
      const fetchStatus = await browser.elementByCss('#fetch-status').text()
      expect(fetchStatus).toBe('200')
    })

    await retry(async () => {
      const contentType = await browser.elementByCss('#content-type').text()
      expect(contentType).toBe('image/png')
    })

    // Log the full verification info for visual inspection
    const fetchedFrom = await browser.elementByCss('#fetched-from').text()
    console.log('Web Worker PNG verification:', {
      fetchedFrom,
      contentType: await browser.elementByCss('#content-type').text(),
      status: await browser.elementByCss('#fetch-status').text(),
    })
  })
})
