import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-catchall', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match correctly when defining an explicit page & slot', async () => {
    const browser = await next.browser('/')
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(
          /@slot default/
        )
      },
      30000,
      1000
    )

    await browser.elementByCss('[href="/foo"]').click()

    // foo has defined a page route and a corresponding parallel slot
    // so we'd expect to see the custom slot content & the page content
    await retry(
      async () => {
        expect(await browser.elementById('children').text()).toMatch(/foo/)
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(/foo slot/)
      },
      30000,
      1000
    )
  })

  it('should match correctly when defining an explicit page but no slot', async () => {
    const browser = await next.browser('/')
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(
          /@slot default/
        )
      },
      30000,
      1000
    )

    await browser.elementByCss('[href="/bar"]').click()

    // bar has defined a slot but no page route
    // so we'd expect to see the catch-all slot & the page content
    await retry(
      async () => {
        expect(await browser.elementById('children').text()).toMatch(/bar/)
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(
          /slot catchall/
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(
          /catchall slot client component/
        )
      },
      30000,
      1000
    )
  })

  it('should match correctly when defining an explicit slot but no page', async () => {
    const browser = await next.browser('/')
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(
          /@slot default/
        )
      },
      30000,
      1000
    )

    await browser.elementByCss('[href="/baz"]').click()

    // baz has defined a page route and a corresponding parallel slot
    // so we'd expect to see the custom slot content & the page content
    await retry(
      async () => {
        expect(await browser.elementById('children').text()).toMatch(
          /main catchall/
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(/baz slot/)
      },
      30000,
      1000
    )
  })

  it('should match both the catch-all page & slot', async () => {
    const browser = await next.browser('/')
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(
          /@slot default/
        )
      },
      30000,
      1000
    )

    await browser.elementByCss('[href="/quux"]').click()

    // quux doesn't have a page or slot defined. It should use the catch-all for both
    await retry(
      async () => {
        expect(await browser.elementById('children').text()).toMatch(
          /main catchall/
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(
          /slot catchall/
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('slot').text()).toMatch(
          /catchall slot client component/
        )
      },
      30000,
      1000
    )
  })
})
