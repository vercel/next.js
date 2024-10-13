/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

const GENERIC_RSC_ERROR =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

describe('use-cache', () => {
  const { next, isNextDev, isNextDeploy, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  const itSkipTurbopack = isTurbopack ? it.skip : it

  // TODO: Fix the following error with Turbopack:
  // Error: Module [project]/app/client.tsx [app-client] (ecmascript) was
  // instantiated because it was required from module...
  itSkipTurbopack('should cache results', async () => {
    const browser = await next.browser('/?n=1')
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1a = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL('/?n=2', next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('2')
    const random2 = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL('/?n=1&unrelated', next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1b = await browser.waitForElementByCss('#y').text()

    // The two navigations to n=1 should use a cached value.
    expect(random1a).toBe(random1b)

    // The navigation to n=2 should be some other random value.
    expect(random1a).not.toBe(random2)

    // Client component should have rendered.
    expect(await browser.waitForElementByCss('#z').text()).toBe('foo')

    // Client component child should have rendered but not invalidated the cache.
    expect(await browser.waitForElementByCss('#r').text()).toContain('rnd')
  })

  it('should dedupe with react cache inside "use cache"', async () => {
    const browser = await next.browser('/react-cache')
    const a = await browser.waitForElementByCss('#a').text()
    const b = await browser.waitForElementByCss('#b').text()
    // TODO: This is broken. It is expected to pass once we fix it.
    expect(a).not.toBe(b)
  })

  it('should error when cookies/headers/draftMode is used inside "use cache"', async () => {
    const browser = await next.browser('/errors')
    expect(await browser.waitForElementByCss('#cookies').text()).toContain(
      isNextDev
        ? 'Route /errors used "cookies" inside "use cache".'
        : GENERIC_RSC_ERROR
    )
    expect(await browser.waitForElementByCss('#headers').text()).toContain(
      isNextDev
        ? 'Route /errors used "headers" inside "use cache".'
        : GENERIC_RSC_ERROR
    )
    expect(await browser.waitForElementByCss('#draft-mode').text()).toContain(
      'Editing: false'
    )

    // CLI assertions are skipped in deploy mode because `next.cliOutput` will only contain build-time logs.
    if (!isNextDeploy) {
      expect(next.cliOutput).toContain(
        'Route /errors used "cookies" inside "use cache". '
      )
      expect(next.cliOutput).toContain(
        'Route /errors used "headers" inside "use cache". '
      )
    }
  })

  itSkipTurbopack('should cache results in route handlers', async () => {
    const response = await next.fetch('/api')
    const { rand1, rand2 } = await response.json()

    expect(rand1).toEqual(rand2)
  })
})
