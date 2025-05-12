import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('useLinkStatus', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show pending state for the last link clicked when clicking multiple links in a row', async () => {
    const browser = await next.browser('/')

    // Click post 1 link
    await browser.elementById('post-1-link').click()

    // Quickly click post 2 link
    await browser.elementById('post-2-link').click()

    // The pending state should be shown for post 2 link
    expect(await browser.elementById('post-2-loading').text()).toBe('(Loading)')

    // Post 1 should not show loading
    const post1Loading = await browser.elementsByCss('#post-1-loading')
    expect(post1Loading.length).toBe(0)

    // Wait for navigation to complete and verify we end up on post 2
    await browser.waitForIdleNetwork()
    await browser.waitForElementByCss('[data-testid="post-2-page"]')
  })

  it('should remove pending state after shallow routing', async () => {
    const browser = await next.browser('/')

    // Click post 1 link
    await browser.elementById('post-1-link').click()

    // Verify pending state is shown
    expect(await browser.elementById('post-1-loading').text()).toBe('(Loading)')

    // Trigger shallow routing by clicking debug mode button
    await browser.elementById('enable-debug-btn').click()

    // Wait for the new render to commit to make sure that the navigation transition is interrupted
    await retry(async () => {
      expect(
        await browser.elementByCss('[data-testid="debug-mode"]').text()
      ).toBe('Debug Mode Enabled')
    })

    // Pending state should be gone
    const post1LoadingElements = await browser.elementsByCss('#post-1-loading')
    expect(post1LoadingElements.length).toBe(0)
  })

  it('should remove pending state after browser back navigation', async () => {
    const browser = await next.browser('/')

    // Click post 1 link
    await browser.elementById('post-1-link').click()

    // Wait for navigation to complete
    await browser.waitForIdleNetwork()
    await browser.waitForElementByCss('[data-testid="post-1-page"]')

    // Click post 2 link
    await browser.elementById('post-2-link').click()

    // Verify pending state is shown
    expect(await browser.elementById('post-2-loading').text()).toBe('(Loading)')

    // Go back using browser back button
    await browser.back()

    // Wait for navigation and verify we're back on home
    // We should be on home because page 2 has not been fully loaded yet when we navigated back
    await browser.waitForIdleNetwork()
    await browser.waitForElementByCss('[data-testid="home-link"]')

    // Pending state should be gone
    const post2LoadingElements = await browser.elementsByCss('#post-2-loading')
    expect(post2LoadingElements.length).toBe(0)
  })

  it('should show pending state when navigating to the same path', async () => {
    const browser = await next.browser('/')

    // Click post 1 link
    await browser.elementById('post-1-link').click()

    // Wait for navigation to complete
    await browser.waitForIdleNetwork()
    await browser.waitForElementByCss('[data-testid="post-1-page"]')

    // Click post 1 link again
    await browser.elementById('post-1-link').click()
    // Verify pending state is shown even though it's the same path
    expect(await browser.elementById('post-1-loading').text()).toBe('(Loading)')

    // Wait for navigation to complete and verify we're still on post 1
    await browser.waitForIdleNetwork()
    await browser.waitForElementByCss('[data-testid="post-1-page"]')
  })

  it('should remove pending state when navigation starts by router.push', async () => {
    const browser = await next.browser('/')

    // Click post 1 link
    await browser.elementById('post-1-link').click()

    // Verify pending state is shown
    expect(await browser.elementById('post-1-loading').text()).toBe('(Loading)')

    // Click router push button for post 2
    await browser.elementById('router-push-2-btn').click()

    // Pending state for post 1 should be gone
    const post1Loading = await browser.elementsByCss('#post-1-loading')
    expect(post1Loading.length).toBe(0)

    // Wait for navigation to complete and verify we end up on post 2
    await browser.waitForIdleNetwork()
    await browser.waitForElementByCss('[data-testid="post-2-page"]')
  })

  it('should remove pending state when server action triggers a redirect', async () => {
    const browser = await next.browser('/post/1')
    await browser.waitForIdleNetwork()
    await browser.waitForElementByCss('[data-testid="post-1-page"]')

    // Click post 2 link
    await browser.elementById('post-2-link').click()

    // Verify pending state is shown
    expect(await browser.elementById('post-2-loading').text()).toBe('(Loading)')

    // Click server action button for home
    await browser.elementById('server-action-home-btn').click()

    await waitFor(1000) // buffer for server action to return a redirect

    // Pending state for post 2 should be gone
    const post2Loading = await browser.elementsByCss('#post-2-loading')
    expect(post2Loading.length).toBe(0)

    // Wait for navigation to complete and verify we end up on home
    await browser.waitForIdleNetwork()
    await browser.waitForElementByCss('[data-testid="home-link"]')
  })
})
