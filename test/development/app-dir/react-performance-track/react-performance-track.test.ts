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
          name: '\u200bfetch (…/random)',
          properties: expect.arrayContaining([
            ['status', '200'],
            ['url', '"https://next-data-api-endpoint.vercel.app/api/random"'],
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
      ])
    )
  })

  it('should show draftMode', async () => {
    const browser = await next.browser('/draftMode', { extraHTTPHeaders })
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    // TODO the addition of a promise to delay some Segments from rendering until the later Static
    // stage has caused the draftMode snapshot to include an empty-named entry. This is probably
    // a bug in React and should be fixed there but
    // expect(track).toEqual([])
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200b [Prerender]',
          properties: [],
        },
      ])
    )
    let didThrow = false
    try {
      // including this anti-assertion here so we can restore the test when the bug in React is fixed
      expect(track).toEqual([])
    } catch (e) {
      didThrow = true
    }
    expect(didThrow).toBe(true)
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
      ])
    )
  })
})
