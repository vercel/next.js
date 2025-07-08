import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('app dir - not found with nested layouts', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should render the custom not-found page when notFound() is thrown from a page', async () => {
    const browser = await next.browser('/')
    await assertNoRedbox(browser)
    const heading = await browser.elementByCss('h1#not-found-heading')
    expect(await heading.text()).toBe('Custom Not Found Page')
  })
})
