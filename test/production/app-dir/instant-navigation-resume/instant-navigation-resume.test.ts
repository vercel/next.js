import { nextTestSetup } from 'e2e-utils'

describe('instant-navigation-resume', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    // Emulate the platform routing an internal resume POST to the App Page
    // handler. Otherwise the headers are stripped or the POST returns 405.
    env: {
      NEXT_PRIVATE_TEST_HEADERS: '1',
      NEXT_PRIVATE_MINIMAL_MODE: '1',
    },
  })

  async function getPostponedState() {
    const { postponed } = await next.readJSON('.next/server/app/index.meta')

    expect(postponed).toEqual(expect.any(String))
    expect(postponed.length).toBeGreaterThan(0)
    return postponed as string
  }

  it('returns static-only HTML for an instant-navigation page load', async () => {
    const postponed = await getPostponedState()
    const cliOutputIndex = next.cliOutput.length
    const response = await next.fetch('/', {
      method: 'POST',
      headers: {
        cookie: 'next-instant-navigation-testing=1',
        'next-resume': '1',
        'x-matched-path': '/',
      },
      body: postponed,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('cache-control')).toContain('no-store')

    const html = await response.text()
    expect(
      next.cliOutput
        .slice(cliOutputIndex)
        .match(/Invariant app-page handler received invalid cache entry PAGES/)
    ).toBeNull()
    expect(html).toContain('self.__next_instant_test')
    expect(html).toContain('</body></html>')
    expect(html.match(/dynamic content/)).toBeNull()
  })

  it('returns empty RSC data for an instant-navigation prefetch', async () => {
    const postponed = await getPostponedState()
    const cliOutputIndex = next.cliOutput.length
    const response = await next.fetch('/', {
      method: 'POST',
      headers: {
        cookie: 'next-instant-navigation-testing=1',
        'next-resume': '1',
        'next-router-prefetch': '1',
        rsc: '1',
        'x-matched-path': '/',
      },
      body: postponed,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/x-component')
    expect(response.headers.get('cache-control')).toContain('no-store')

    const rsc = await response.text()
    expect(
      next.cliOutput
        .slice(cliOutputIndex)
        .match(/Invariant app-page handler received invalid cache entry PAGES/)
    ).toBeNull()
    expect(rsc).toBe('')
  })
})
