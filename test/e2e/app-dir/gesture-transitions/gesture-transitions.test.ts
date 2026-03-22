/**
 * Tests for experimental_gesturePush, which enables gesture-driven navigation
 * via React's Gesture Transitions feature.
 *
 * The test simulates a gesture by using two buttons:
 * - "Start Gesture" calls experimental_gesturePush and begins an async
 *   transition that doesn't complete until "End Gesture" is clicked
 * - "End Gesture" resolves the pending promise and triggers the canonical
 *   router.push
 *
 * This allows us to observe the intermediate gesture state before the
 * canonical navigation completes.
 */
import { nextTestSetup } from 'e2e-utils'

describe('gesture-transitions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('shows optimistic state during gesture, then canonical state after', async () => {
    const browser = await next.browser('/')

    // Verify we're on the home page
    expect(
      await browser.elementByCss('[data-testid="home-page"]').text()
    ).toContain('Home')

    // Click "Start Gesture" to begin the optimistic navigation
    await browser.elementByCss('[data-testid="start-gesture"]').click()

    // The target page content should be visible (optimistic state)
    const targetPage = await browser.elementByCss('[data-testid="target-page"]')
    expect(await targetPage.text()).toContain('Target Page')

    // Static content should be visible
    expect(
      await browser.elementByCss('[data-testid="static-content"]').text()
    ).toBe('This is static content')

    // The URL should have updated to /target-page
    expect(await browser.url()).toContain('/target-page')

    // Click "End Gesture" to complete the canonical navigation
    await browser.elementByCss('[data-testid="end-gesture"]').click()

    // After the gesture ends, we should still be on the target page
    // with the canonical state (dynamic content fully loaded)
    const dynamicContent = await browser.elementByCss(
      '[data-testid="dynamic-content"]'
    )
    expect(await dynamicContent.text()).toBe('Dynamic content')

    // URL should still be /target-page
    expect(await browser.url()).toContain('/target-page')
  })
})
