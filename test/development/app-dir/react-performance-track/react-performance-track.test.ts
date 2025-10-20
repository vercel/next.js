import { nextTestSetup } from 'e2e-utils'

describe('react-performance-track', () => {
  // false is the default when visiting pages as an ordinary user.
  // true is the default when having Chrome DevTools open.
  // Hardcoded for now since most of the actual behavior is not intended.
  const disableCache = false
  const extraHTTPHeaders = disableCache
    ? { 'Cache-Control': 'no-cache' }
    : undefined

  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show setTimeout', async () => {
    const browser = await next.browser('/set-timeout', { extraHTTPHeaders })
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        { name: '\u200bsetTimeout', properties: [] },
        { name: '\u200bsetTimeout', properties: [] },
      ])
    )
  })

  it('should show fetch', async () => {
    const browser = await next.browser('/fetch', { extraHTTPHeaders })
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          // React might decide to display the shorthand in round brackets differently.
          // Double check with React changes if a shorthand change is intended.
          // TODO: Should include short name "(…/random)" and URL
          name: '\u200bfetch',
          properties: expect.arrayContaining([
            ['status', '200'],
            ['url', '""'],
          ]),
        },
      ])
    )
  })

  it('should show params', async () => {
    const browser = await next.browser('/params/next', { extraHTTPHeaders })
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200bparams [Prefetchable]',
          properties: [],
        },
      ])
    )
  })

  it('should show searchParams', async () => {
    const browser = await next.browser('/searchparams?slug=next', {
      extraHTTPHeaders,
    })
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200bsearchParams [Prefetchable]',
          properties: [],
        },
      ])
    )
  })

  it('should show cookies', async () => {
    const browser = await next.browser('/cookies', { extraHTTPHeaders })
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200bcookies [Prefetchable]',
          properties: [],
        },
        // TODO: The error message makes this seem like it shouldn't pop up here.
        {
          name: '\u200bcookies',
          properties: [
            [
              'rejected with',
              'During prerendering, `cookies()` rejects when the prerender is complete. ' +
                'Typically these errors are handled by React but if you move `cookies()` to a different context by using `setTimeout`, `after`, or similar functions you may observe this error and you should handle it in that context. ' +
                'This occurred at route "/cookies".',
            ],
          ],
        },
      ])
    )
  })

  it('should show draftMode', async () => {
    const browser = await next.browser('/draftMode', { extraHTTPHeaders })
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    // TODO: Should include "draftMode [Prefetchable]".
    expect(track).toEqual([
      {
        name: '\u200b',
        properties: [],
      },
    ])
  })

  it('should show headers', async () => {
    const browser = await next.browser('/headers', { extraHTTPHeaders })
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200bheaders [Prefetchable]',
          properties: [],
        },
        // TODO: The error message makes this seem like it shouldn't pop up here.
        {
          name: '\u200bheaders',
          properties: [
            [
              'rejected with',
              'During prerendering, `headers()` rejects when the prerender is complete. ' +
                'Typically these errors are handled by React but if you move `headers()` to a different context by using `setTimeout`, `after`, or similar functions you may observe this error and you should handle it in that context. ' +
                'This occurred at route "/headers".',
            ],
          ],
        },
      ])
    )
  })
})
