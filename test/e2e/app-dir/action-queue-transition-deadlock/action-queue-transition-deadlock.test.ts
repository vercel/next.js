import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('action-queue-transition-deadlock', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not deadlock when navigation and server action are triggered together multiple times', async () => {
    const browser = await next.browser('/')

    // Verify initial state
    expect(await browser.elementById('status').text()).toBe('idle')

    // Click the button to start a transition with navigation + server action
    await browser.elementById('trigger-btn').click()

    // The transition should start
    await retry(async () => {
      const status = await browser.elementById('status').text()
      expect(status).toBe('pending')
    })

    // Click again while the first action is still pending
    // This is the pattern that triggers the deadlock in the bug
    await browser.elementById('trigger-btn').click()

    // Wait for navigation to complete - should NOT deadlock
    // The bug would cause the app to hang here forever
    await retry(
      async () => {
        const heading = await browser.elementById('other-page').text()
        expect(heading).toBe('Other Page')
      },
      5000, // 5 second timeout - should be more than enough
      500,
      'waiting for navigation to complete without deadlock'
    )
  })

  it('should complete transition even when server action is discarded due to navigation', async () => {
    const browser = await next.browser('/')

    // Start transition
    await browser.elementById('trigger-btn').click()

    // Verify pending state
    await retry(async () => {
      expect(await browser.elementById('status').text()).toBe('pending')
    })

    // Navigation should eventually complete
    await retry(
      async () => {
        const heading = await browser.elementById('other-page').text()
        expect(heading).toBe('Other Page')
      },
      5000,
      500,
      'waiting for single navigation to complete'
    )
  })
})
