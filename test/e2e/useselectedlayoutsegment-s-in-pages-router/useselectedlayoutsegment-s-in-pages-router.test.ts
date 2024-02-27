import { nextTestSetup } from 'e2e-utils'

describe('useSelectedLayoutSegment(s) in Pages Router', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should work using browser', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('body').text()).toBe('Hello World')
  })
})
