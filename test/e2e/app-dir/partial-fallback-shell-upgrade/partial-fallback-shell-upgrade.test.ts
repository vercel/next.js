import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { splitResponseWithPPRSentinel } from 'e2e-utils/ppr'
import { retry, waitFor } from 'next-test-utils'
import path from 'path'

const isAdapterTest = Boolean(process.env.NEXT_ENABLE_ADAPTER)

type NextInstance = ReturnType<typeof nextTestSetup>['next']

function createSplitHTMLFetcher(next: NextInstance) {
  return async function fetchSplitHTML(pathname: string) {
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
      dynamicPart,
      static$: cheerio.load(staticPart),
    }
  }
}

describe('partial-fallback-shell-upgrade', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'default'),
    // The latest changes to support this behavior on deployed infra are available in the adapter,
    // and are not being backported to the CLI
    skipDeployment: !isAdapterTest,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  const fetchSplitHTML = createSplitHTMLFetcher(next)

  it('should upgrade the fallback shell to a route shell', async () => {
    const pathname = '/two'
    let $ = await next.render$(pathname)
    expect($('#fallback').text()).toBe('loading...')
    expect($('#slug').closest('[hidden]').length).toBe(1)

    await retry(async () => {
      $ = await next.render$(pathname)
      expect($('#slug').closest('[hidden]').length).toBe(0)
      expect($('#fallback').length).toBe(0)
    })
  })

  it('should not upgrade a route shell when no params were prerendered', async () => {
    const pathname = '/no-gsp/two'
    const start = Date.now()

    await retry(
      async () => {
        const $ = await next.render$(pathname)
        expect($('#fallback').text()).toBe('loading...')
        expect($('#slug').closest('[hidden]').length).toBe(1)

        if (Date.now() - start < 5000) {
          throw new Error('continue polling fallback shell')
        }
      },
      6000,
      500,
      'no-gsp fallback shell should remain unupgraded'
    )
  })

  it('should upgrade a generic shell into the most specific prerendered shell', async () => {
    const firstResult = await fetchSplitHTML('/prefix/c/foo')

    expect(firstResult.response.status).toBe(200)
    expect(firstResult.static$('#one').length).toBe(0)
    expect(firstResult.static$('#one-fallback').text()).toBe('loading one...')
    expect(firstResult.static$('#two-fallback').length).toBe(0)
    expect(firstResult.static$('#two').length).toBe(0)
    expect(firstResult.dynamicPart).toContain('<div id="one">c</div>')
    expect(firstResult.dynamicPart).toContain('<div id="two">foo</div>')

    await retry(async () => {
      const secondResult = await fetchSplitHTML('/prefix/c/bar')

      expect(secondResult.response.status).toBe(200)
      expect(secondResult.static$('#one').text()).toBe('c')
      expect(secondResult.static$('#one-fallback').length).toBe(0)
      expect(secondResult.static$('#two-fallback').text()).toBe(
        'loading two...'
      )
      expect(secondResult.static$('#two').length).toBe(0)
      expect(secondResult.dynamicPart).toContain('<div id="two">bar</div>')
      expect(secondResult.dynamicPart).not.toContain('<div id="two">foo</div>')
    })
  })

  it('should let a segment prefetch trigger the background shell upgrade', async () => {
    const prefetchResponse = await next.fetch('/prefix/z/foo', {
      headers: {
        rsc: '1',
        'next-router-prefetch': '1',
        'next-router-segment-prefetch': '/_tree',
      },
    })

    expect(prefetchResponse.status).toBe(200)

    // Wait a moment to let the background upgrade to finish
    await waitFor(3000)

    const result = await fetchSplitHTML('/prefix/z/bar')

    expect(result.response.status).toBe(200)
    expect(result.static$('#one').text()).toBe('z')
    expect(result.static$('#one-fallback').length).toBe(0)
    expect(result.static$('#two-fallback').text()).toBe('loading two...')
    expect(result.static$('#two').length).toBe(0)
    expect(result.dynamicPart).toContain('<div id="two">bar</div>')
    expect(result.dynamicPart).not.toContain('<div id="two">foo</div>')
  })

  it('should not keep upgrading once only fully dynamic params remain', async () => {
    const firstResult = await fetchSplitHTML('/prefix/b/foo')
    const start = Date.now()

    expect(firstResult.response.status).toBe(200)
    expect(firstResult.static$('#one').text()).toBe('b')
    expect(firstResult.static$('#one-fallback').length).toBe(0)
    expect(firstResult.static$('#two-fallback').text()).toBe('loading two...')
    expect(firstResult.static$('#two').length).toBe(0)
    expect(firstResult.dynamicPart).toContain('<div id="two">foo</div>')

    await retry(
      async () => {
        const secondResult = await fetchSplitHTML('/prefix/b/bar')

        expect(secondResult.response.status).toBe(200)
        expect(secondResult.static$('#one').text()).toBe('b')
        expect(secondResult.static$('#one-fallback').length).toBe(0)
        expect(secondResult.static$('#two-fallback').text()).toBe(
          'loading two...'
        )
        expect(secondResult.static$('#two').length).toBe(0)
        expect(secondResult.dynamicPart).toContain('<div id="two">bar</div>')
        expect(secondResult.dynamicPart).not.toContain(
          '<div id="two">foo</div>'
        )

        if (Date.now() - start < 5000) {
          throw new Error('continue polling more complete shell')
        }
      },
      6000,
      500,
      'shell should remain partial when remaining params are dynamic'
    )
  })
})
