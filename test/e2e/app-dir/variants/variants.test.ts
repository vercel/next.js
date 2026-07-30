import { nextTestSetup, isNextDev } from 'e2e-utils'

// Only the dynamic path is implemented so far. Reading a variant while
// prerendering throws, so `next build` fails outright in start mode. Enable for
// all modes once static generation supports variants.
;(isNextDev ? describe : describe.skip)('variants', () => {
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
