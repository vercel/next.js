import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { splitResponseWithPPRSentinel } from 'e2e-utils/ppr'

const isAdapterTest = process.env.NEXT_ENABLE_ADAPTER === '1'

describe('partial-fallback-root-blocking', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    // The latest changes to support this behavior on deployed infra are available in the adapter,
    // and are not being backported to the CLI
    skipDeployment: !isAdapterTest,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  async function fetchSplitHTML(pathname: string) {
    let response: Awaited<ReturnType<typeof next.fetch>> | undefined
    const [staticPart, dynamicPart] = await splitResponseWithPPRSentinel(
      async () => {
        response = await next.fetch(pathname)
        expect(response.status).toBe(200)

        if (!response.body) {
          throw new Error(`Expected a streamed response body for ${pathname}`)
        }

        return response.body
      }
    )

    return {
      response: response!,
      staticPart,
      dynamicPart,
      static$: cheerio.load(staticPart),
    }
  }

  // TODO: Re-enable once infra supports multiple layers of fallbacks
  if (!isNextDeploy) {
    it('should serve unknown root branches with the root param resolved and other params deferred', async () => {
      const firstResult = await fetchSplitHTML('/fr/two')

      // The root param must resolve into the served shell — never another
      // branch's value — because root params vary the document itself.
      expect(firstResult.response.status).toBe(200)
      expect(firstResult.static$('#lang-fallback').length).toBe(0)
      expect(firstResult.static$('#lang').text()).toBe('fr')

      // `slug` can never be provided by generateStaticParams, so the
      // blocking render must not resolve it into the cached entry: it stays
      // deferred in the shell and resumes per request — the same serving
      // shape as the generated `en` branch below, except the first request
      // blocks on creating the branch's entry instead of serving a
      // build-time fallback.
      expect(firstResult.static$('#slug-fallback').text()).toBe(
        'loading slug...'
      )
      expect(firstResult.static$('#slug').length).toBe(0)
      expect(firstResult.dynamicPart).toContain('<div id="slug">two</div>')

      // A different slug on the same root branch is served from the same
      // entry, with its own slug resumed.
      const secondResult = await fetchSplitHTML('/fr/other')

      expect(secondResult.response.status).toBe(200)
      expect(secondResult.static$('#lang-fallback').length).toBe(0)
      expect(secondResult.static$('#lang').text()).toBe('fr')
      expect(secondResult.static$('#slug-fallback').text()).toBe(
        'loading slug...'
      )
      expect(secondResult.static$('#slug').length).toBe(0)
      expect(secondResult.dynamicPart).toContain('<div id="slug">other</div>')
    })
  }

  it('should still serve a fallback shell for generated root branches', async () => {
    const result = await fetchSplitHTML('/en/two')

    expect(result.response.status).toBe(200)
    expect(result.static$('#lang').text()).toBe('en')
    expect(result.static$('#lang-fallback').length).toBe(0)
    expect(result.static$('#slug-fallback').text()).toBe('loading slug...')
    expect(result.static$('#slug').length).toBe(0)
    expect(result.dynamicPart).toContain('<div id="slug">two</div>')
  })
})
