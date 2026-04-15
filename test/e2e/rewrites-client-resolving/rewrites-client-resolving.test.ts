import { nextTestSetup } from 'e2e-utils'

describe('Client-side rewrites resolving', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should break rewrites chain when dynamic route matches', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#product-link').click()
    await browser.waitForElementByCss('#product')

    expect(await browser.elementByCss('#product').text()).toBe('product: first')
  })

  it('should break rewrites chain when normal page matches', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#products-link').click()
    await browser.waitForElementByCss('#products')

    expect(await browser.elementByCss('#products').text()).toBe('products')
  })

  it('should break rewrites chain when dynamic catch-all route matches', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#category-link').click()
    await browser.waitForElementByCss('#category')

    expect(await browser.elementByCss('#category').text()).toBe(
      'category: first'
    )
  })

  it('should break rewrites chain when dynamic catch-all route multi-level matches', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#category-link-again').click()
    await browser.waitForElementByCss('#category')

    expect(await browser.elementByCss('#category').text()).toBe(
      'category: hello/world'
    )
  })

  it('should break rewrites chain after matching /category', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#categories-link').click()
    await browser.waitForElementByCss('#categories')

    expect(await browser.elementByCss('#categories').text()).toBe('categories')
  })
})
