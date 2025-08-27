import { nextTestSetup } from 'e2e-utils'

describe('webpack HMR with %5F encoded underscore routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should serve hot-update files correctly for %5F routes without 400 errors', async () => {
    const browser = await next.browser('/_child')

    // Wait for initial page load
    await browser.waitForElementByCss('h1')
    expect(await browser.elementByCss('h1').text()).toBe('Child Page')
    expect(await browser.elementByCss('p').text()).toBe('Original text')

    // Listen for network requests to catch potential 400 errors
    const logs: string[] = []
    browser.on('response', (response) => {
      if (response.url().includes('hot-update') && response.status() >= 400) {
        logs.push(
          `Hot-update request failed: ${response.url()} - Status: ${response.status()}`
        )
      }
    })

    // Trigger HMR by modifying the client component
    await next.patchFile('app/%5Fchild/page.tsx', (content) =>
      content.replace('Original text', 'HMR updated text')
    )

    // Wait for HMR to complete successfully
    let retries = 0
    const maxRetries = 50
    while (retries < maxRetries) {
      const text = await browser.elementByCss('p').text()
      if (text === 'HMR updated text') {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
      retries++
    }

    // Verify no 400 errors occurred for hot-update files
    expect(logs).toEqual([])

    // Verify the content was updated via HMR (not full page reload)
    expect(await browser.elementByCss('h1').text()).toBe('Child Page')
    expect(await browser.elementByCss('p').text()).toBe('HMR updated text')
  })
})
