import { nextTestSetup } from 'e2e-utils'
import { splitResponseWithPPRSentinel } from 'e2e-utils/ppr'
import cheerio from 'cheerio'

// A host in minimal mode serves the stored document from its own cache and
// sends the browser's refresh to Next.js. This plays the host's requests
// against `next start` in minimal mode.
// How the hole's content appears in a Flight payload.
const DYNAMIC_ROW = '{"id":"dynamic","children":["Now: ",'

describe('ppr-cdn-mode-minimal-mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_PRIVATE_MINIMAL_MODE: '1',
      NEXT_PRIVATE_TEST_HEADERS: '1',
    },
  })

  function expectCompleteDocument(html: string) {
    expect(html.trimEnd()).toEndWith('</html>')
    expect(html).toContain('self.__next_f.push(')
    expect(html).toMatch(/\$RX\("B:[0-9a-z]+",""\)/)
    const $ = cheerio.load(html)
    expect($('#heading').text()).toBe('Static heading')
    expect($('#fallback').text()).toBe('Loading…')
    expect($('#dynamic').length).toBe(0)
  }

  it('stores a complete document that needs no resume', async () => {
    expectCompleteDocument(await next.readFile('.next/server/app/index.html'))
  })

  it('renders the complete document for a document request', async () => {
    // In minimal mode the test harness marks the start of the response
    // instead of the start of a resume.
    const parts = await splitResponseWithPPRSentinel(async () => {
      const res = await next.fetch('/', { headers: { 'x-matched-path': '/' } })
      expect(res.status).toBe(200)
      return res.body
    })
    expectCompleteDocument(parts.join(''))
  })

  it('answers the refresh with dynamic content when the host sends the postponed state', async () => {
    const { postponed } = await next.readJSON('.next/server/app/index.meta')
    expect(postponed).toEqual(expect.any(String))

    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        rsc: '1',
        'next-resume': '1',
        'x-matched-path': '/',
      },
      body: postponed,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toStartWith('text/x-component')
    expect(await res.text()).toContain(DYNAMIC_ROW)
  })

  // Minimal mode only renders an RSC request dynamically when it comes with
  // postponed state, so today a host has to send it. Once the server reads
  // the stored data itself, a plain refresh gets dynamic content too.
  it('answers a refresh without postponed state from the static payload', async () => {
    const res = await next.fetch('/?_rsc=ppr-cdn-mode', {
      headers: { rsc: '1', 'x-matched-path': '/' },
    })
    expect(res.status).toBe(200)
    const payload = await res.text()
    expect(payload).toContain('"id":"heading"')
    expect(payload).not.toContain(DYNAMIC_ROW)
  })
})
