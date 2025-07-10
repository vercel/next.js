import { nextTestSetup } from 'e2e-utils'

// Entries are flaky in CI. Without a name and without being able to repro locally,
// it's impossible to fix. Deactivating while we iterate on the track.
// It's still useful as a fixture.
describe('react-performance-track', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show setTimeout', async () => {
    const browser = await next.browser('/set-timeout')
    await browser.elementByCss('[data-react-server-requests-done]')

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        { name: 'setTimeout', properties: [] },
        { name: 'setTimeout', properties: [] },
      ])
    )
  })

  it('should show fetch', async () => {
    const browser = await next.browser('/fetch')
    await browser.elementByCss('[data-react-server-requests-done]')

    const track = await browser.eval('window.reactServerRequests.getSnapshot()')
    expect(track).toEqual(
      expect.arrayContaining([
        {
          // TODO: Should include the URL.
          name: 'fetch',
          properties: expect.arrayContaining([['status', '200']]),
        },
      ])
    )
  })
})
