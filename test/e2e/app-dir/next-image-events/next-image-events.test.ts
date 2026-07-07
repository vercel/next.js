import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('next-image-events', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not call onLoad multiple times', async () => {
    const imageRequests = []
    const browser = await next.browser('/fulfilled', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          if (request.resourceType() === 'image') {
            imageRequests.push(request.url())
          }
        })
      },
    })

    let logsIdx = 0
    await retry(async () => {
      const logs = await browser.log()
      expect(
        logs.slice(logsIdx).filter(({ source }) => source === 'error')
      ).toEqual([
        {
          source: 'error',
          message: 'hydrated image load',
        },
      ])
      logsIdx = logs.length
    })
    expect(imageRequests).toEqual([expect.stringContaining('test')])
    imageRequests.length = 0

    await browser.locator(':text("Show Client image")').click()

    await retry(async () => {
      const logs = await browser.log()
      expect(
        logs.slice(logsIdx).filter(({ source }) => source === 'error')
      ).toEqual([
        {
          source: 'error',
          message: 'client rendered image load',
        },
      ])
      logsIdx = logs.length
    })
    expect(imageRequests).toEqual([expect.stringContaining('test')])
    imageRequests.length = 0

    await browser.locator(':text("rerender Page")').click()

    const logs = await browser.log()
    expect(
      logs.slice(logsIdx).filter(({ source }) => source === 'error')
    ).toEqual([])
    expect(imageRequests).toEqual([])
    imageRequests.length = 0
  })

  it('should not infinitely retry on error', async () => {
    const nextImageRequests: string[] = []
    let logsIdx = 0
    const browser = await next.browser('/rejected', {
      beforePageLoad(page) {
        // We're manually aborting here to simulate an error before React hydrates.
        // A real request might settle too late to test this behavior reliably.
        // Especially in dev, requests (even if warm) may take longer than hydration.
        page.route(
          /\/will-never-exist\.png|\/still-doesnt-exist\.png/,
          (route) => {
            nextImageRequests.push(route.request().url())
            return route.abort()
          }
        )
      },
    })

    await retry(async () => {
      const logs = await browser.log()
      expect(
        logs.slice(logsIdx).filter(({ source }) => source === 'error')
      ).toEqual([
        {
          source: 'error',
          message: 'Failed to load resource: net::ERR_FAILED',
        },
        // Next.js retries once to trigger onError on SSRed, settled images.
        // If this test fails, we'll either hydrated faster than the request settled,
        // or dropped the retrying behavior of next/image
        {
          source: 'error',
          message: 'Failed to load resource: net::ERR_FAILED',
        },
        {
          source: 'error',
          message: 'hydrated image error',
        },
      ])
      logsIdx = logs.length
    })
    expect(nextImageRequests).toEqual([
      expect.stringContaining('will-never-exist'),
      // Next.js retries once to trigger onError on SSRed, settled images.
      // If this test fails, we'll either hydrated faster than the request settled,
      // or dropped the retrying behavior of next/image
      expect.stringContaining('will-never-exist'),
    ])
    nextImageRequests.length = 0

    await browser.locator(':text("Show Client image")').click()

    await retry(async () => {
      const logs = await browser.log()
      expect(
        logs.slice(logsIdx).filter(({ source }) => source === 'error')
      ).toEqual([
        {
          source: 'error',
          message: 'Failed to load resource: net::ERR_FAILED',
        },
        {
          source: 'error',
          message: 'client rendered image error',
        },
      ])
      logsIdx = logs.length
    })
    expect(nextImageRequests).toEqual([
      expect.stringContaining('still-doesnt-exist'),
    ])
    nextImageRequests.length = 0

    await browser.locator(':text("rerender Page")').click()

    const logs = await browser.log()
    expect(
      logs.slice(logsIdx).filter(({ source }) => source === 'error')
    ).toEqual([])
    expect(nextImageRequests).toEqual([])
    nextImageRequests.length = 0
    logsIdx = logs.length
  })
})
