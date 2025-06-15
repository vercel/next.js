import { nextTestSetup } from 'e2e-utils'

describe('barrel-optimization-recurrsive-bundle', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageManager: 'yarn',
    dependencies: {
      antd: '5.23.4',
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('button').text()).toBe('Click')

    const browser = await next.browser('/')
    expect(await browser.elementByCss('button').text()).toBe('Click')
  })
})
