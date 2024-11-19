import { nextTestSetup } from 'e2e-utils'

describe('app dir - css - experimental inline css', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render page with correct styles', async () => {
    const browser = await next.browser('/')

    const inlineStyleTag = await browser.elementByCss('style')
    expect(await inlineStyleTag.text()).toContain('color')

    const p = await browser.elementByCss('p')
    expect(await p.getComputedCss('color')).toBe('rgb(255, 255, 0)') // yellow
  })
})
