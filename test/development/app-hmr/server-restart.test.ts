import { FileRef, nextTestSetup, createNext } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import path from 'path'

describe('app-dir server restart', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    patchFileDelay: 1000,
  })

  it('should reload the page when the server restarts', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(/hello world/)
    })

    // Verify the counter is at 0 initially
    expect(await browser.elementById('counter-value').text()).toBe('Count: 0')

    // Click increment button to change state
    await browser.elementById('increment-button').click()
    expect(await browser.elementById('counter-value').text()).toBe('Count: 1')

    // Click again to make it 2
    await browser.elementById('increment-button').click()
    expect(await browser.elementById('counter-value').text()).toBe('Count: 2')

    // Set up reload detection before stopping the server
    let reloadPromise = new Promise((resolve) => {
      browser.on('request', (req) => {
        if (req.url().endsWith('/')) {
          resolve(req.url())
        }
      })
    })

    const appPort = next.appPort
    await next.destroy()

    // Start a new server instance on the same port
    const secondNext = await createNext({
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
      env: next.env,
      forcedPort: appPort,
    })

    // Wait for the new server to be ready
    await waitFor(1000)

    // Wait for the browser to reload
    await reloadPromise

    // Verify the page content is still available after reload
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(/hello world/)
    })

    // IMPORTANT: Verify the counter state is reset to 0 after reload
    // This proves the page actually reloaded and didn't just reconnect
    await retry(async () => {
      expect(await browser.elementById('counter-value').text()).toBe('Count: 0')
    })

    await secondNext.destroy()
  })
})
