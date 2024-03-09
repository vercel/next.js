import { nextTestSetup } from 'e2e-utils'

describe('root-not-found-missing-root-layout', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not conflict with generated layout on dev server', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('not found')
  })
})
