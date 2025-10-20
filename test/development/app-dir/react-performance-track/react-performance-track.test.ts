import { nextTestSetup } from 'e2e-utils'

describe('react-performance-track', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show setTimeout', async () => {
    const browser = await next.browser('/set-timeout')
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
    const browser = await next.browser('/fetch')
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
    const browser = await next.browser('/params/next')
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200bparams [Prefetch]',
          properties: [],
        },
      ])
    )
  })

  it('should show searchParams', async () => {
    const browser = await next.browser('/searchparams?slug=next')
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200bsearchParams [Prefetch]',
          properties: [],
        },
      ])
    )
  })

  it('should show cookies', async () => {
    const browser = await next.browser('/cookies')
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200bcookies [Prefetch]',
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
    const browser = await next.browser('/draftMode')
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    // TODO: Should include "draftMode [Prefetch]".
    expect(track).toEqual([
      {
        name: '\u200b',
        properties: [],
      },
    ])
  })

  it('should show headers', async () => {
    const browser = await next.browser('/headers')
    await browser.elementByCss('[data-react-server-requests-done]', {
      state: 'attached',
    })

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          name: '\u200bheaders [Prefetch]',
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
