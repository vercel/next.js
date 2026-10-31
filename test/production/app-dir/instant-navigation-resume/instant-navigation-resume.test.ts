import { nextTestSetup } from 'e2e-utils'
import { randomUUID } from 'node:crypto'
import cheerio from 'cheerio'

// This test directly emulates the platform's internal resume request using
// locally generated postponed state and private runtime switches.
// @force-gate !deploy
describe('instant-navigation-resume', () => {
  const { next } = nextTestSetup({
    files: __dirname,
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

  // ppr-platform-guide.mdx: a pure resume puts the opaque postponed state in
  // the entire request body; no action or state-prefix-length header is needed.
  // This is the origin-side protocol, independently of the testing cookie used
  // by the instant-navigation cases below.
  it.each(['html', 'rsc'])(
    '[R27] resumes deferred %s content from a nonempty postponed body',
    async (format) => {
      const postponed = await getPostponedState()
      const token = randomUUID()
      const response = await next.fetch('/', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'next-resume': '1',
          'x-matched-path': '/',
          'x-resume-contract': token,
          ...(format === 'rsc' ? { rsc: '1' } : {}),
        },
        body: postponed,
        signal: AbortSignal.timeout(15000),
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain(
        format === 'rsc' ? 'text/x-component' : 'text/html'
      )
      const body = await response.text()
      expect(body).toContain('dynamic content')
      expect(body).toContain(token)
      if (format === 'html') {
        const $ = cheerio.load(body)
        expect($('#dynamic').text()).toBe('dynamic content')
        expect($('#resume-token').text()).toBe(token)
        expect($('#shell')).toHaveLength(0)
        expect($('#fallback')).toHaveLength(0)
      }
    }
  )

  it('handles an instant-navigation document resume', async () => {
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
    await response.text()
    expect(
      next.cliOutput
        .slice(cliOutputIndex)
        .match(/Invariant app-page handler received invalid cache entry PAGES/)
    ).toBeNull()
  })

  it('handles an instant-navigation RSC prefetch resume', async () => {
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
    await response.text()
    expect(
      next.cliOutput
        .slice(cliOutputIndex)
        .match(/Invariant app-page handler received invalid cache entry PAGES/)
    ).toBeNull()
  })
})
