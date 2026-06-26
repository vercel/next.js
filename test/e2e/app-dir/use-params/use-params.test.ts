import { nextTestSetup } from 'e2e-utils'

describe('use-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work for single dynamic param', async () => {
    const $ = await next.render$('/a/b')
    expect($('#param-id').text()).toBe('a')
  })
  it('should work for nested dynamic params', async () => {
    const $ = await next.render$('/a/b')
    expect($('#param-id').text()).toBe('a')
    expect($('#param-id2').text()).toBe('b')
  })

  it('should work for catch all params', async () => {
    const $ = await next.render$('/a/b/c/d/e/f/g')
    expect($('#params').text()).toBe('["a","b","c","d","e","f","g"]')
  })

  it('should work for single dynamic param client navigating', async () => {
    const browser = await next.browser('/')
    expect(
      await browser
        .elementByCss('#to-a')
        .click()
        .waitForElementByCss('#param-id')
        .text()
    ).toBe('a')
  })

  it('should work for nested dynamic params client navigating', async () => {
    const browser = await next.browser('/')
    await browser
      .elementByCss('#to-a-b')
      .click()
      .waitForElementByCss('#param-id')
    expect(await browser.elementByCss('#param-id').text()).toBe('a')
    expect(await browser.elementByCss('#param-id2').text()).toBe('b')
  })

  it('should work on pages router', async () => {
    const browser = await next.browser('/pages-dir/foobar')
    expect(await browser.elementById('params').text()).toBe('"foobar"')
  })

  it("shouldn't rerender host component when prefetching", async () => {
    const browser = await next.browser('/rerenders/foobar')
    const initialRandom = await browser.elementById('random').text()
    const link = await browser.elementByCss('a')
    await link.hover()
    const newRandom = await browser.elementById('random').text()
    expect(initialRandom).toBe(newRandom)
  })
})
