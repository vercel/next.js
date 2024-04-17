/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'

describe('Async modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('app router server component async module', async () => {
    const browser = await next.browser('/app-router')
    expect(await browser.elementByCss('#app-router-value').text()).toBe('hello')
  })

  // TODO: Investigate/fix issue with React loading async modules failing.
  // Rename app/app-router/client-component/skipped-page.tsx to app/app-router/client-component/page.tsx to run this test.
  it.skip('app router client component async module', async () => {
    const browser = await next.browser('/app-router/client')
    expect(
      await browser.elementByCss('#app-router-client-component-value').text()
    ).toBe('hello')
  })
})
