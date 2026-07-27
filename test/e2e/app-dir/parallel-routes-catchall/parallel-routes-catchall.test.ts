import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('parallel-routes-catchall', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match correctly when defining an explicit page & slot', async () => {
    const browser = await next.browser('/')
    await check(() => browser.elementById('slot').text(), /@slot default/)

    await browser.elementByCss('[href="/foo"]').click()

    // foo has defined a page route and a corresponding parallel slot
    // so we'd expect to see the custom slot content & the page content
    await check(() => browser.elementById('children').text(), /foo/)
    await check(() => browser.elementById('slot').text(), /foo slot/)
  })

  it('should match correctly when defining an explicit page but no slot', async () => {
    const browser = await next.browser('/')
    await check(() => browser.elementById('slot').text(), /@slot default/)

    await browser.elementByCss('[href="/bar"]').click()

    // bar has defined a slot but no page route
    // so we'd expect to see the catch-all slot & the page content
    await check(() => browser.elementById('children').text(), /bar/)
    await check(() => browser.elementById('slot').text(), /slot catchall/)
    await check(
      () => browser.elementById('slot').text(),
      /catchall slot client component/
    )
  })

  it('should match correctly when defining an explicit slot but no page', async () => {
    const browser = await next.browser('/')
    await check(() => browser.elementById('slot').text(), /@slot default/)

    await browser.elementByCss('[href="/baz"]').click()

    // baz has defined a page route and a corresponding parallel slot
    // so we'd expect to see the custom slot content & the page content
    await check(() => browser.elementById('children').text(), /main catchall/)
    await check(() => browser.elementById('slot').text(), /baz slot/)
  })

  it('should match both the catch-all page & slot', async () => {
    const browser = await next.browser('/')
    await check(() => browser.elementById('slot').text(), /@slot default/)

    await browser.elementByCss('[href="/quux"]').click()

    // quux doesn't have a page or slot defined. It should use the catch-all for both
    await check(() => browser.elementById('children').text(), /main catchall/)
    await check(() => browser.elementById('slot').text(), /slot catchall/)
    await check(
      () => browser.elementById('slot').text(),
      /catchall slot client component/
    )
  })
})
