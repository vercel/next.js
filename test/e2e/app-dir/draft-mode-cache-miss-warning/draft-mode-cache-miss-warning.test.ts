import { nextTestSetup } from 'e2e-utils'

import { UNEXPECTED_CACHE_MISS_MESSAGE } from 'next/src/server/use-cache/use-cache-errors'

// Deploy mode exclusion: This suite asserts local server CLI output.
// @force-gate !deploy
describe('draft mode cache miss warning', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Dev skips the two-phase prerender when Draft Mode bypasses caches, so
    // the production warning this suite covers is not emitted there.
    it.skip('production prerender warning only', () => {})
    return
  }

  async function enableDraftMode(): Promise<string> {
    const response = await next.fetch('/enable-draft')
    const setCookie = response.headers.get('set-cookie')

    if (!setCookie) {
      throw new Error('Expected /enable-draft to set a draft mode cookie.')
    }

    return setCookie.split(';')[0]
  }

  // A runtime prefetch (`next-router-prefetch: 2`) awaits the final prerender
  // before responding, so a cache-miss warning is already in the server log
  // when this promise resolves.
  async function runtimePrefetch(cookie?: string) {
    return next.fetch('/?prefetch=runtime', {
      headers: {
        rsc: '1',
        'next-router-prefetch': '2',
        ...(cookie ? { cookie } : {}),
      },
    })
  }

  it('does not warn when Draft Mode bypasses "use cache" during partial prerendering', async () => {
    const outputStart = next.cliOutput.length

    const publicPrefetch = await runtimePrefetch()
    expect(publicPrefetch.status).toBe(200)

    const cookie = await enableDraftMode()

    const draftPrefetch = await runtimePrefetch(cookie)
    expect(draftPrefetch.status).toBe(200)
    await draftPrefetch.text()

    const firstDraft = await next.fetch('/', {
      headers: { cookie },
    })
    expect(firstDraft.status).toBe(200)
    const firstHtml = await firstDraft.text()
    expect(firstHtml).toContain('draft-enabled')
    const firstTime = firstHtml.match(/id="time">([^<]+)/)?.[1]
    expect(firstTime).toBeTruthy()

    const secondDraft = await next.fetch('/', {
      headers: { cookie },
    })
    const secondHtml = await secondDraft.text()
    const secondTime = secondHtml.match(/id="time">([^<]+)/)?.[1]

    // Bypassing the cache is the intended Draft Mode behavior: each request
    // renders fresh data instead of the prerendered entry.
    expect(secondTime).toBeTruthy()
    expect(secondTime).not.toBe(firstTime)

    // The document render starts an embedded runtime prerender after its cache
    // reads settle, and that work is not awaited by the response. The runtime
    // prefetch above is awaited, so its warning (if any) is already logged.
    // This pause covers the embedded prerender.
    await new Promise((resolve) => setTimeout(resolve, 1000))

    expect(next.cliOutput.slice(outputStart)).not.toContain(
      UNEXPECTED_CACHE_MISS_MESSAGE
    )
  })
})
