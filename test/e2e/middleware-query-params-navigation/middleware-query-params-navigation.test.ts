import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('middleware-query-params-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/54077
  // router.query should preserve dynamic route params when middleware is active
  it('should preserve dynamic route params in router.query after client-side navigation with middleware', async () => {
    const browser = await next.browser('/')

    // Navigate to dynamic route via Link
    await browser.elementByCss('#to-user').click()
    await browser.waitForElementByCss('#user-id')

    // Verify initial params are correct
    await retry(async () => {
      const query = JSON.parse(await browser.elementByCss('#query').text())
      expect(query.userId).toBe('user1')
    })
    expect(await browser.elementByCss('#user-id').text()).toBe('user1')
    expect(await browser.elementByCss('#pathname').text()).toBe(
      '/users/[userId]/test'
    )
    expect(await browser.elementByCss('#as-path').text()).toBe(
      '/users/user1/test'
    )

    // Click button that does router.push with spread router.query + new param
    // This is the scenario from issue #54077 where params get lost
    await browser.elementByCss('#add-step').click()

    await retry(async () => {
      const query = JSON.parse(await browser.elementByCss('#query').text())
      expect(query).toEqual({ userId: 'user1', step: '1' })
    })

    // URL should be properly interpolated, not show [userId]
    expect(await browser.elementByCss('#as-path').text()).toBe(
      '/users/user1/test?step=1'
    )
    expect(await browser.elementByCss('#user-id').text()).toBe('user1')

    // Do another navigation to verify params persist through multiple pushes
    await browser.elementByCss('#add-step-2').click()

    await retry(async () => {
      const query = JSON.parse(await browser.elementByCss('#query').text())
      expect(query).toEqual({ userId: 'user1', step: '2' })
    })

    expect(await browser.elementByCss('#as-path').text()).toBe(
      '/users/user1/test?step=2'
    )
    expect(await browser.elementByCss('#user-id').text()).toBe('user1')
  })

  it('should preserve dynamic route params after direct router.push navigation', async () => {
    const browser = await next.browser('/users/user1/test')

    // Wait for hydration
    await retry(async () => {
      const query = JSON.parse(await browser.elementByCss('#query').text())
      expect(query.userId).toBe('user1')
    })

    // Push with spread query
    await browser.elementByCss('#add-step').click()

    await retry(async () => {
      const query = JSON.parse(await browser.elementByCss('#query').text())
      expect(query).toEqual({ userId: 'user1', step: '1' })
    })

    expect(await browser.elementByCss('#as-path').text()).toBe(
      '/users/user1/test?step=1'
    )
  })
})
