import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('hmr-top-level-await', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should preserve state when editing a module with top-level await', async () => {
    const browser = await next.browser('/')

    // Verify initial render
    await retry(async () => {
      expect(await browser.elementByCss('#message').text()).toBe(
        'Hello from TLA'
      )
    })

    // Create state by clicking the button
    await browser.elementByCss('#increment').click()
    await browser.elementByCss('#increment').click()
    expect(await browser.elementByCss('#count').text()).toBe('2')

    // Edit the TLA module - Fast Refresh should preserve state
    await next.patchFile('lib/tla-module.ts', (content) =>
      content.replace('Hello from TLA', 'Updated TLA message')
    )

    // Verify the message updated but counter state was preserved
    await retry(async () => {
      expect(await browser.elementByCss('#message').text()).toBe(
        'Updated TLA message'
      )
    })

    // Counter should still be 2 if Fast Refresh worked (not full reload)
    expect(await browser.elementByCss('#count').text()).toBe('2')
  })

  it('should preserve state when editing the component that imports TLA', async () => {
    const browser = await next.browser('/')

    // Wait for initial render
    await retry(async () => {
      expect(await browser.elementByCss('#message').text()).toContain('TLA')
    })

    // Create state
    await browser.elementByCss('#increment').click()
    expect(await browser.elementByCss('#count').text()).toBe('1')

    // Edit the page component itself
    await next.patchFile('app/page.tsx', (content) =>
      content.replace('Increment', 'Increment Counter')
    )

    // Verify the button text updated
    await retry(async () => {
      expect(await browser.elementByCss('#increment').text()).toBe(
        'Increment Counter'
      )
    })

    // Counter should still be 1 if Fast Refresh worked
    expect(await browser.elementByCss('#count').text()).toBe('1')
  })
})
