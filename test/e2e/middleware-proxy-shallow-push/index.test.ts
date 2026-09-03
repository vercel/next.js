import { nextTestSetup } from 'e2e-utils'

describe('middleware rewrite using dynamic parameters', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('static pages: should work with shallow routing', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('This is the Homepage')
    await browser.elementById('some-route-link').click()
    expect(await browser.eval('location.pathname')).toBe('/some-route')
    await browser.waitForElementByCss('#shallow-link')
    await browser.elementById('shallow-link').click()
    await browser.elementById('shallow-link').click()
    expect(await browser.eval('location.pathname')).toBe('/some-route')
    expect(await browser.eval('location.search')).toBe('?xyz=world')
    expect(await browser.elementByCss('p').text()).toBe('This is some route')
  })

  it('dynamic pages: should work with shallow routing', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('This is the Homepage')
    await browser.elementById('dynamic-route-link').click()
    expect(await browser.eval('location.pathname')).toBe('/sub/100')
    await browser.waitForElementByCss('#shallow-link')
    await browser.elementById('shallow-link').click()
    await browser.elementById('shallow-link').click()
    expect(await browser.eval('location.pathname')).toBe('/sub/100')
    expect(await browser.eval('location.search')).toBe('?xyz=world')
    expect(await browser.elementByCss('p').text()).toBe('This is a sub page')
  })
})
