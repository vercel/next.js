import { nextTestSetup } from 'e2e-utils'

const PENDING_MARKER = 'awaiting-param-prerender'

describe('param matching blocking policy on client navigation', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped || isNextDev) {
    it.skip('only runs against a production route cache', () => {})
    return
  }

  /**
   * Returns the response body split by the chunks it was flushed in, so a
   * response that is withheld until it is complete can be told apart from one
   * that streams a fallback first.
   */
  async function readFlushes(response: Response): Promise<string[]> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const flushes: string[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      flushes.push(decoder.decode(value, { stream: true }))
    }

    const rest = decoder.decode()
    if (rest) flushes.push(rest)

    return flushes
  }

  it('withholds the document response until the blocking param is prerendered', async () => {
    const response = await next.fetch('/blocking/doc-miss')
    expect(response.status).toBe(200)

    const flushes = await readFlushes(response)

    // The first flush already carries the prerendered content, not the
    // Suspense fallback: the response waited for the unlisted param.
    expect(flushes[0]).toContain('<p id="data">ready:doc-miss</p>')
    expect(flushes[0]).not.toContain(`<p id="pending">${PENDING_MARKER}</p>`)
  })

  // The blocking policy is not applied to the client navigation request, so
  // the response is flushed with the Suspense fallback before the prerender
  // for the unlisted param is done. A fix makes the first flush carry the
  // prerendered content, like the document request above, and this expectation
  // needs to be updated with it.
  it('streams the Suspense fallback for the navigation request of an unlisted blocking param', async () => {
    const response = await next.fetch('/blocking/nav-miss', {
      headers: { RSC: '1' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/x-component')

    const flushes = await readFlushes(response)

    expect(flushes[0]).toContain(PENDING_MARKER)
    expect(flushes[0]).not.toContain('ready:nav-miss')
    expect(flushes.join('')).toContain('ready:nav-miss')
  })
})
