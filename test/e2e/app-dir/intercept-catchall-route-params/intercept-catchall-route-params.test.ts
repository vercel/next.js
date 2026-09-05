import { nextTestSetup } from 'e2e-utils'

describe('intercept-catchall-route-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    ['/photos/a/b', ['a', 'b']],
    ['/photos/only', ['only']],
  ])(
    'keeps %s params as an array when intercepting',
    async (href, expected) => {
      const browser = await next.browser('/photos')
      await browser.elementByCss(`a[href="${href}"]`).click()

      const serverParams = await browser
        .waitForElementByCss('#server-params')
        .text()
      const clientParams = await browser
        .waitForElementByCss('#client-params')
        .text()

      expect(JSON.parse(serverParams)).toEqual(expected)
      expect(JSON.parse(clientParams)).toEqual(expected)
    }
  )

  it('does not intercept a hard navigation', async () => {
    const browser = await next.browser('/photos/a/b')
    const params = await browser.waitForElementByCss('#page').text()

    expect(JSON.parse(params)).toEqual(['a', 'b'])
  })
})
