import { nextTestSetup } from 'e2e-utils'

describe('react-performance-track', () => {
  const { next } = nextTestSetup({
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
    // FIXME: Should show await fetch
    expect(track).toEqual([])
  })
})
