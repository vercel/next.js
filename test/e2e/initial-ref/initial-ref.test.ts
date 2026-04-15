import { nextTestSetup } from 'e2e-utils'

describe('Initial Refs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Has correct initial ref values', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#ref-val').text()).toContain('76px')
  })
})
