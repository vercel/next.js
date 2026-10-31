import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('Configuration', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function get$(path: string) {
    const html = await next.render(path)
    return cheerio.load(html)
  }

  it('should disable X-Powered-By header support', async () => {
    const res = await next.fetch('/')
    const header = res.headers.get('X-Powered-By')
    expect(header).not.toBe('Next.js')
  })

  test('correctly imports a package that defines `module` but no `main` in package.json', async () => {
    const $ = await get$('/module-only-content')
    expect($('#messageInAPackage').text()).toBe('OK')
  })

  it('should have env variables available on the client', async () => {
    const browser = await next.browser('/next-config')
    const envValue = await browser.elementByCss('#env').text()
    expect(envValue).toBe('hello')
    await browser.close()
  })
})
