import { nextTestSetup } from 'e2e-utils'

describe('react-performance-track', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  it('should show setTimeout', async () => {
    const browser = await next.browser('/set-timeout')
    await browser.elementByCss('[data-react-server-requests-done]')

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual([
      { name: 'setTimeout', properties: [] },
      { name: 'setTimeout', properties: [] },
    ])
  })

  it('should show fetch', async () => {
    const browser = await next.browser('/fetch')
    await browser.elementByCss('[data-react-server-requests-done]')

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual([
      {
        // TODO(veil): Should always be `fetch (random)`
        name: isTurbopack ? 'fetch (random)' : 'patched',
        properties: expect.arrayContaining([
          ['status', '200'],
          // Not sure if this is useful to assert on. Feel free to remove is this breaks often
          ['body', isTurbopack ? 'ReadableStream' : 'TeeReadableStream'],
        ]),
      },
    ])
  })
})
