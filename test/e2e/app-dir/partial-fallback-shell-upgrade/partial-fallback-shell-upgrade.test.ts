import cheerio from 'cheerio'
import { randomUUID } from 'crypto'
import { nextTestSetup } from 'e2e-utils'
import { splitResponseWithPPRSentinel } from 'e2e-utils/ppr'
import { retry, waitFor } from 'next-test-utils'
import path from 'path'

type NextInstance = ReturnType<typeof nextTestSetup>['next']

function createSplitHTMLFetcher(next: NextInstance) {
  return async function fetchSplitHTML(pathname: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)

    const [staticPart, dynamicPart] = await splitResponseWithPPRSentinel(
      async () => {
        if (!response.body) {
          throw new Error(`Expected a streamed response body for ${pathname}`)
        }

        return response.body
      }
    )

    return {
      response,
      dynamicPart,
      static$: cheerio.load(staticPart),
    }
  }
}

// The legacy Vercel builder does not implement the Cache Components shell
// eligibility and upgrade behavior asserted here.
// @force-gate !deploy || adapter
describe('partial-fallback-shell-upgrade', () => {
  const { next, isNextDev } = nextTestSetup({
    // Deployed shell upgrades require `partialFallback` metadata, which the
    // adapter only emits when Partial Prefetching is enabled in the fixture.
    files: path.join(__dirname, 'fixtures', 'default'),
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

  it('should upgrade a required fallback shell with mixed generateStaticParams lengths', async () => {
    // A second cold path must still use the required source shell after the
    // first exact path completes.
    for (const bottom of [`first-${randomUUID()}`, `second-${randomUUID()}`]) {
      const pathname = `/mixed/short/${bottom}`
      const firstResult = await fetchSplitHTML(pathname)

      expect(firstResult.static$('#top').text()).toBe('short')
      expect(firstResult.static$('#top-fallback').length).toBe(0)
      expect(firstResult.static$('#bottom').length).toBe(0)
      expect(firstResult.static$('#bottom-fallback').text()).toBe(
        'loading bottom...'
      )
      expect(firstResult.dynamicPart).toContain(
        `<div id="bottom">${bottom}</div>`
      )
      expect(firstResult.static$('#dynamic').length).toBe(0)
      expect(firstResult.static$('#dynamic-fallback').text()).toBe(
        'loading dynamic...'
      )
      expect(firstResult.dynamicPart).toContain(
        '<div id="dynamic">Dynamic content</div>'
      )

      await retry(async () => {
        const completedResult = await fetchSplitHTML(pathname)

        expect(completedResult.static$('#top').text()).toBe('short')
        expect(completedResult.static$('#top-fallback').length).toBe(0)
        expect(completedResult.static$('#bottom').text()).toBe(bottom)
        expect(completedResult.static$('#bottom-fallback').length).toBe(0)
        expect(completedResult.dynamicPart).not.toContain(
          `<div id="bottom">${bottom}</div>`
        )
        expect(completedResult.static$('#dynamic').length).toBe(0)
        expect(completedResult.static$('#dynamic-fallback').text()).toBe(
          'loading dynamic...'
        )
        expect(completedResult.dynamicPart).toContain(
          '<div id="dynamic">Dynamic content</div>'
        )
      })
    }
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

// The legacy Vercel builder does not implement the Cache Components shell
// eligibility and upgrade behavior asserted here.
// @force-gate !deploy || adapter
describe('partial-fallback-shell-upgrade - partialPrefetching disabled', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'partial-prefetching-disabled'),
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  const fetchSplitHTML = createSplitHTMLFetcher(next)

  it('should not upgrade the fallback shell to a route shell', async () => {
    const pathname = '/two'
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
      'fallback shell should remain unupgraded without partialPrefetching'
    )
  })

  it('should not specialize a generic shell into a more specific shell', async () => {
    const firstResult = await fetchSplitHTML('/prefix/c/foo')

    expect(firstResult.response.status).toBe(200)
    expect(firstResult.static$('#one').length).toBe(0)
    expect(firstResult.static$('#one-fallback').text()).toBe('loading one...')
    expect(firstResult.dynamicPart).toContain('<div id="one">c</div>')
    expect(firstResult.dynamicPart).toContain('<div id="two">foo</div>')

    const start = Date.now()

    await retry(
      async () => {
        const secondResult = await fetchSplitHTML('/prefix/c/bar')

        expect(secondResult.response.status).toBe(200)
        // The generic shell stays shared: `#one` is never baked into the
        // static part the way it is when Partial Prefetching is enabled.
        expect(secondResult.static$('#one').length).toBe(0)
        expect(secondResult.static$('#one-fallback').text()).toBe(
          'loading one...'
        )
        expect(secondResult.dynamicPart).toContain('<div id="one">c</div>')
        expect(secondResult.dynamicPart).toContain('<div id="two">bar</div>')

        if (Date.now() - start < 5000) {
          throw new Error('continue polling generic shell')
        }
      },
      6000,
      500,
      'generic shell should remain shared without partialPrefetching'
    )
  })

  it('shares an on-demand shell across params without generateStaticParams', async () => {
    const firstResult = await fetchSplitHTML('/blocking/c/foo')
    const renderedAt = firstResult.static$('#one').attr('data-rendered-at')

    expect(firstResult.static$('#one').text()).toBe('c')
    expect(renderedAt).toMatch(/^\d+(?:\.\d+)?$/)
    expect(firstResult.static$('#two').length).toBe(0)
    expect(firstResult.static$('#two-fallback').text()).toBe('loading two...')
    expect(firstResult.dynamicPart).toContain('<div id="two">foo</div>')

    if (isNextDeploy) {
      await retry(async () => {
        const cachedResult = await fetchSplitHTML('/blocking/c/foo')
        expect(cachedResult.response.headers.get('x-vercel-cache')).toBe('HIT')
      })
    }

    const secondResult = await fetchSplitHTML('/blocking/c/bar')

    expect(secondResult.static$('#one').text()).toBe('c')
    expect(secondResult.static$('#one').attr('data-rendered-at')).toBe(
      renderedAt
    )
    expect(secondResult.static$('#two').length).toBe(0)
    expect(secondResult.static$('#two-fallback').text()).toBe('loading two...')
    expect(secondResult.dynamicPart).toContain('<div id="two">bar</div>')
    expect(secondResult.dynamicPart).not.toContain('<div id="two">foo</div>')

    if (isNextDeploy) {
      expect(secondResult.response.headers.get('x-vercel-cache')).toBe('HIT')
    }
  })

  it('keeps params without generateStaticParams dynamic after explicit revalidation of an on-demand shell', async () => {
    const pathname = '/blocking/d/foo'
    const firstResult = await fetchSplitHTML(pathname)
    const firstRenderedAt = firstResult.static$('#one').attr('data-rendered-at')
    expect(firstRenderedAt).toMatch(/^\d+(?:\.\d+)?$/)

    if (isNextDeploy) {
      await retry(async () => {
        const cachedResult = await fetchSplitHTML(pathname)
        expect(cachedResult.response.headers.get('x-vercel-cache')).toBe('HIT')
        expect(cachedResult.static$('#one').attr('data-rendered-at')).toBe(
          firstRenderedAt
        )
      })
    }

    const revalidateResponse = await next.fetch(
      `/api/revalidate?path=${encodeURIComponent(pathname)}`
    )
    expect(revalidateResponse.status).toBe(200)
    expect(await revalidateResponse.json()).toEqual({ revalidated: true })

    await retry(async () => {
      const revalidatedResult = await fetchSplitHTML(pathname)
      const revalidatedAt = revalidatedResult
        .static$('#one')
        .attr('data-rendered-at')

      expect(revalidatedResult.static$('#one').text()).toBe('d')
      expect(revalidatedAt).toMatch(/^\d+(?:\.\d+)?$/)
      expect(revalidatedAt).not.toBe(firstRenderedAt)
      expect(revalidatedResult.static$('#two').length).toBe(0)
      expect(revalidatedResult.static$('#two-fallback').text()).toBe(
        'loading two...'
      )
      expect(revalidatedResult.dynamicPart).toContain('<div id="two">foo</div>')

      const secondResult = await fetchSplitHTML('/blocking/d/bar')

      expect(secondResult.static$('#one').text()).toBe('d')
      expect(secondResult.static$('#one').attr('data-rendered-at')).toBe(
        revalidatedAt
      )
      expect(secondResult.static$('#two').length).toBe(0)
      expect(secondResult.static$('#two-fallback').text()).toBe(
        'loading two...'
      )
      expect(secondResult.dynamicPart).toContain('<div id="two">bar</div>')
      expect(secondResult.dynamicPart).not.toContain('<div id="two">foo</div>')

      if (isNextDeploy) {
        expect(secondResult.response.headers.get('x-vercel-cache')).toBe('HIT')
      }
    })
  })

  it('keeps params without generateStaticParams dynamic after explicit revalidation of a servable fallback shell', async () => {
    const pathname = '/prefix/d/foo'
    const firstResult = await fetchSplitHTML(pathname)

    expect(firstResult.static$('#one').length).toBe(0)
    expect(firstResult.static$('#one-fallback').text()).toBe('loading one...')
    expect(firstResult.static$('#two').length).toBe(0)
    expect(firstResult.dynamicPart).toContain('<div id="one">d</div>')
    expect(firstResult.dynamicPart).toContain('<div id="two">foo</div>')

    const revalidateResponse = await next.fetch(
      `/api/revalidate?path=${encodeURIComponent(pathname)}`
    )
    expect(revalidateResponse.status).toBe(200)
    expect(await revalidateResponse.json()).toEqual({ revalidated: true })

    const revalidatedResult = await fetchSplitHTML(pathname)

    expect(revalidatedResult.static$('#two').length).toBe(0)
    expect(revalidatedResult.dynamicPart).toContain('<div id="two">foo</div>')

    const secondResult = await fetchSplitHTML('/prefix/d/bar')

    expect(secondResult.static$('#two').length).toBe(0)
    expect(secondResult.dynamicPart).toContain('<div id="two">bar</div>')
    expect(secondResult.dynamicPart).not.toContain('<div id="two">foo</div>')
  })

  it('reuses generated optional catch-all pages before and after explicit revalidation', async () => {
    for (const [pathname, parts] of [
      ['/optional/named', 'named'],
      ['/optional', ''],
    ]) {
      const first$ = await next.render$(pathname)
      const firstRenderedAt = first$('#optional').attr('data-rendered-at')

      expect(first$('#optional').text()).toBe(parts)
      expect(firstRenderedAt).toMatch(/^\d+(?:\.\d+)?$/)

      const repeated$ = await next.render$(pathname)

      expect(repeated$('#optional').text()).toBe(parts)
      expect({
        pathname,
        renderedAt: repeated$('#optional').attr('data-rendered-at'),
      }).toEqual({ pathname, renderedAt: firstRenderedAt })

      if (isNextDeploy) {
        await retry(async () => {
          const cachedResponse = await next.fetch(pathname)
          expect(cachedResponse.status).toBe(200)
          const cached$ = cheerio.load(await cachedResponse.text())
          expect(cachedResponse.headers.get('x-vercel-cache')).toBe('HIT')
          expect(cached$('#optional').attr('data-rendered-at')).toBe(
            firstRenderedAt
          )
        })
      }

      const revalidateResponse = await next.fetch(
        `/api/revalidate?path=${encodeURIComponent(pathname)}`
      )
      expect(revalidateResponse.status).toBe(200)
      expect(await revalidateResponse.json()).toEqual({ revalidated: true })

      await retry(async () => {
        const revalidated$ = await next.render$(pathname)
        const revalidatedRenderedAt =
          revalidated$('#optional').attr('data-rendered-at')

        expect(revalidated$('#optional').text()).toBe(parts)
        expect(revalidatedRenderedAt).toMatch(/^\d+(?:\.\d+)?$/)
        expect(revalidatedRenderedAt).not.toBe(firstRenderedAt)

        const cached$ = await next.render$(pathname)

        expect(cached$('#optional').text()).toBe(parts)
        expect({
          pathname,
          renderedAt: cached$('#optional').attr('data-rendered-at'),
        }).toEqual({ pathname, renderedAt: revalidatedRenderedAt })
      })
    }
  })

  it('revalidates the shared terminal shell without resolving dynamic params', async () => {
    const pathname = '/prefix/b/foo'
    const firstResult = await fetchSplitHTML(pathname)
    const firstRenderedAt = firstResult
      .static$('[data-rendered-at]')
      .attr('data-rendered-at')

    expect(firstResult.static$('[data-rendered-at]').length).toBe(1)
    expect(firstRenderedAt).toMatch(/^\d+(?:\.\d+)?$/)
    expect(firstResult.static$('#two').length).toBe(0)
    expect(firstResult.dynamicPart).toContain('<div id="two">foo</div>')

    const repeatedResult = await fetchSplitHTML(pathname)

    expect(repeatedResult.static$('[data-rendered-at]').length).toBe(1)
    expect(
      repeatedResult.static$('[data-rendered-at]').attr('data-rendered-at')
    ).toBe(firstRenderedAt)
    expect(repeatedResult.static$('#two').length).toBe(0)
    expect(repeatedResult.dynamicPart).toContain('<div id="two">foo</div>')

    const revalidateResponse = await next.fetch(
      `/api/revalidate?path=${encodeURIComponent(pathname)}`
    )
    expect(revalidateResponse.status).toBe(200)
    expect(await revalidateResponse.json()).toEqual({ revalidated: true })

    await retry(async () => {
      const revalidatedResult = await fetchSplitHTML(pathname)
      const revalidatedRenderedAt = revalidatedResult
        .static$('[data-rendered-at]')
        .attr('data-rendered-at')

      expect(revalidatedResult.static$('[data-rendered-at]').length).toBe(1)
      expect(revalidatedRenderedAt).toMatch(/^\d+(?:\.\d+)?$/)
      expect(revalidatedRenderedAt).not.toBe(firstRenderedAt)
      expect(revalidatedResult.static$('#two').length).toBe(0)
      expect(revalidatedResult.dynamicPart).toContain('<div id="two">foo</div>')

      const siblingResult = await fetchSplitHTML('/prefix/b/bar')

      expect(siblingResult.static$('[data-rendered-at]').length).toBe(1)
      expect(
        siblingResult.static$('[data-rendered-at]').attr('data-rendered-at')
      ).toBe(revalidatedRenderedAt)
      expect(siblingResult.static$('#two').length).toBe(0)
      expect(siblingResult.dynamicPart).toContain('<div id="two">bar</div>')
      expect(siblingResult.dynamicPart).not.toContain('<div id="two">foo</div>')
    })
  })
})
