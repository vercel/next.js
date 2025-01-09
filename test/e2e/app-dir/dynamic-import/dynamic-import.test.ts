import { nextTestSetup } from 'e2e-utils'

describe('dynamic-import', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the dynamically imported component', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('button').text()).toBe('submit')
  })
})
