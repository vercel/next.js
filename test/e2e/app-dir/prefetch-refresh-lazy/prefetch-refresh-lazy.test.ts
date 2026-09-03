import { nextTestSetup } from 'e2e-utils'

describe('prefetch-refresh-lazy', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not trigger new prefetches for prefetch={false} links on router.refresh()', async () => {
    let prefetchRequests = []
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          const url = request.url()
          if (url.includes('prefetch=1')) {
            prefetchRequests.push(url)
          }
        })
      },
    })

    // Confirm links are visible
    expect(await browser.elementById('link-1').isDisplayed()).toBe(true)
    expect(await browser.elementById('link-2').isDisplayed()).toBe(true)

    // Wait a bit to ensure no initial prefetches were fired (since prefetch={false})
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(prefetchRequests.length).toBe(0)

    const initialTimestamp = await browser.elementById('timestamp').text()

    // Trigger refresh
    await browser.elementById('refresh-button').click()

    // Wait for the page to update (timestamp should change)
    await (async () => {
      for (let i = 0; i < 50; i++) {
        const currentTimestamp = await browser.elementById('timestamp').text()
        if (currentTimestamp !== initialTimestamp) return
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error('Timed out waiting for re-render after refresh')
    })()

    // Wait a bit more to see if any prefetches are triggered after refresh
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Assert that zero new prefetch requests were fired for the visible links
    expect(prefetchRequests.length).toBe(0)
  })
})
