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
        name: isTurbopack ? 'fetch (random)' : 'fetch',
        properties: expect.arrayContaining([['status', '200']]),
      },
    ])
  })
})
