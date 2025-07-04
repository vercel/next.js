import { nextTestSetup } from 'e2e-utils'

describe('react-performance-track', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show setTimeout', async () => {
    const browser = await next.browser('/set-timeout')

    const track = await browser.eval('window.reactServerRequests')
    expect(track).toEqual([
      { name: 'setTimeout', properties: [] },
      { name: 'setTimeout', properties: [] },
    ])
  })

  it('should show fetch', async () => {
    const browser = await next.browser('/fetch')

    const track = await browser.eval('window.reactServerRequests')
    // FIXME: Should show await fetch and await response.json()
    expect(track).toEqual([])
  })
})
