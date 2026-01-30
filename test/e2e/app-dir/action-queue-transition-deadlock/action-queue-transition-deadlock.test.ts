import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('action-queue-transition-deadlock', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // This test verifies that the fix for https://github.com/vercel/next.js/issues/84299
  // works correctly. The bug occurs when:
  // 1. User clicks a button that triggers router.push() + await serverAction()
  // 2. User clicks again while the first action is still pending
  // 3. The second navigation discards the first action, but if the promise isn't
  //    resolved, useTransition's isPending stays true forever (deadlock)
  it('should not deadlock when navigation is triggered while server action is pending', async () => {
    const browser = await next.browser('/')

    // Verify initial state
    await retry(async () => {
      const status = await browser.elementById('status').text()
      expect(status).toBe('idle')
    })

    // Click the button to start a transition with navigation + server action
    await browser.elementById('trigger-btn').click()

    // Wait for pending state
    await retry(async () => {
      const status = await browser.elementById('status').text()
      expect(status).toBe('pending')
    })

    // Click again while the first action is still pending
    // This triggers another navigation which should discard the pending action
    await browser.elementById('trigger-btn').click()

    // Wait for navigation to complete - should NOT deadlock
    // The bug would cause the app to hang here forever
    await retry(
      async () => {
        const url = await browser.url()
        expect(url).toContain('/other')
      },
      15000,
      1000,
      'waiting for navigation to /other'
    )

    // Verify we're on the other page
    const heading = await browser.elementById('other-page').text()
    expect(heading).toBe('Other Page')
  })
})
