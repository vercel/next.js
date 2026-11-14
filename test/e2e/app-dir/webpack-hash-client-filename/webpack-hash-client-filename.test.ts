import { nextTestSetup } from 'e2e-utils'

describe('webpack-hash-client-filename', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders and hydrates a Client Component whose filename contains #', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#counter').text()).toBe('count: 0')
    await browser.elementByCss('#counter').click()

    expect(await browser.elementByCss('#counter').text()).toBe('count: 1')
  })
})
