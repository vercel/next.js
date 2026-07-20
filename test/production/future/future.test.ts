import { nextTestSetup } from 'e2e-utils'

describe('excludeDefaultMomentLocales', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      moment: 'latest',
    },
  })

  it('should load momentjs', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toMatch(/current time/i)
    const locales = await browser.eval('moment.locales()')
    expect(locales).toEqual(['en'])
    expect(locales.length).toBe(1)
    await browser.close()
  })
})
