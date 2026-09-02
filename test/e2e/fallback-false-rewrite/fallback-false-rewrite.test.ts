import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// Assertions don't apply to deploy mode (output differs vs. local Next.js server).
// @force-gate !deploy
describe('fallback: false rewrite', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should rewrite correctly for path at same level as fallback: false SSR', async () => {
    const res = await next.fetch('/hello', { redirect: 'manual' })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#another').text()).toBe('another')
    expect(JSON.parse($('#query').text())).toEqual({
      path: ['hello'],
    })
  })

  it('should rewrite correctly for path above fallback: false SSR', async () => {
    const res = await next.fetch('/hello/world', { redirect: 'manual' })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#another').text()).toBe('another')
    expect(JSON.parse($('#query').text())).toEqual({
      path: ['hello', 'world'],
    })
  })

  it('should rewrite correctly for path at same level as fallback: false client', async () => {
    const browser = await next.browser('/hello')

    expect(await browser.elementByCss('#another').text()).toBe('another')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      path: ['hello'],
    })
  })

  it('should rewrite correctly for path above fallback: false client', async () => {
    const browser = await next.browser('/hello/world')

    expect(await browser.elementByCss('#another').text()).toBe('another')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      path: ['hello', 'world'],
    })
  })

  it('should not rewrite for path from fallback: false SSR', async () => {
    const res = await next.fetch('/first', { redirect: 'manual' })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#slug').text()).toContain('hello')
    expect(JSON.parse($('#query').text())).toEqual({
      slug: 'first',
    })
  })

  it('should not rewrite for path from fallback: false client', async () => {
    const browser = await next.browser('/second')

    expect(await browser.elementByCss('#slug').text()).toContain('hello')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: 'second',
    })
  })

  it('should behave properly when accessing the dynamic param directly', async () => {
    const res = await next.fetch('/[slug]', { redirect: 'manual' })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#another').text()).toBe('another')
    expect(JSON.parse($('#query').text())).toEqual({
      path: ['[slug]'],
    })
  })
})
