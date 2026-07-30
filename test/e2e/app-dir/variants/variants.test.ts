import { nextTestSetup } from 'e2e-utils'

describe('variants', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should resolve a variant to its default value', async () => {
    const $ = await next.render$('/')

    expect($('#theme').text()).toBe('light')
  })

  it('should resolve a variant from the request', async () => {
    const $ = await next.render$('/', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
  })

  it('should not expose the internal variants prefix to the client', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#theme').text()).toBe('light')
    expect(await browser.eval('location.pathname')).toBe('/')
  })
})
