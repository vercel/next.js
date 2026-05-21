import { nextTestSetup } from 'e2e-utils'

describe('Configuration with next.config.mjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should disable X-Powered-By header support', async () => {
    const res = await next.fetch('/')
    expect(res.headers.get('X-Powered-By')).not.toBe('Next.js')
  })

  it('correctly imports a package that defines `module` but no `main` in package.json', async () => {
    const $ = await next.render$('/module-only-content')
    expect($('#messageInAPackage').text()).toBe('OK')
  })

  it('should have env variables available on the client', async () => {
    const browser = await next.browser('/next-config')
    const envValue = await browser.elementByCss('#env').text()
    expect(envValue).toBe('hello')
  })
})
