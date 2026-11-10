import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('hydrates correctly for normal page', async () => {
    const browser = await next.browser('/')
    expect(await browser.eval('window.didHydrate')).toBe(true)
  })

  it('hydrates correctly for //', async () => {
    const browser = await next.browser('//')
    expect(await browser.eval('window.didHydrate')).toBe(true)
  })

  it('should be able to navigate after loading //', async () => {
    const browser = await next.browser('//')
    await browser.eval('window.beforeNav = true')
    await browser.eval('window.next.router.push("/details")')
    await retry(async () => {
      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toMatch(/details/)
    })
    expect(await browser.eval('window.beforeNav')).toBe(true)
  })
})
