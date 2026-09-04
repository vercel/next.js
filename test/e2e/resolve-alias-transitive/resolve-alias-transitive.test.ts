import { nextTestSetup } from 'e2e-utils'

describe('resolve-alias-transitive', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply resolveAlias to imports from transitive dependencies', async () => {
    const $ = await next.render$('/')
    expect($('#result').text()).toBe('alt')
  })

  it('should apply resolveAlias on client navigation', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#result').text()).toBe('alt')
  })
})
