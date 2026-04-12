import { nextTestSetup } from 'e2e-utils'

describe('turbopack resolve extension alias', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should resolve .js import to .tsx file via ../', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#greeting').text()).toBe(
      'Hello from TSX'
    )
  })

  it('should resolve .js import to .ts file via ../', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#sum').text()).toBe('3')
  })

  it('should resolve .js import to actual .js file via ../', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#plain').text()).toBe('from-plain-js')
  })

  it('should resolve .js import to .ts file via ./', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#same-dir').text()).toBe(
      'same-dir-works'
    )
  })

  it('should resolve .js import to .ts file via ../../', async () => {
    const browser = await next.browser('/nested')
    expect(await browser.elementByCss('#nested-sum').text()).toBe('30')
  })
})
