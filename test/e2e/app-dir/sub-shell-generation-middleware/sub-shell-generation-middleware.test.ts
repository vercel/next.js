import { nextTestSetup } from 'e2e-utils'
import * as cheerio from 'cheerio'
import { retry } from 'next-test-utils'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

describe('middleware-static-rewrite', () => {
  const { next, isNextDeploy, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it.skip('skipping dev test', () => {})
    return
  }

  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    // Here we're validating that the correct fallback shell was used for
    // rendering.
    it('should use the correct fallback route', async () => {
      // First try to load a page that'll use the base fallback route with the
      // `/[first]/[second]/[third]` fallback.
      let $ = await next.render$('/first/second/third')

      expect($('[data-slug]').data('slug')).toBe('first/second/third')

      // Get the sentinel value that was generated at build time or runtime.
      expect($('[data-layout="/"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/[first]"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/[first]/[second]"]').data('sentinel')).toBe(
        'buildtime'
      )
      expect(
        $('[data-layout="/[first]/[second]/[third]"]').data('sentinel')
      ).toBe('buildtime')

      // Then we try to load a page that'll use the `/first/second/[third]`
      // fallback.
      $ = await next.render$('/first/second/not-third')

      expect($('[data-slug]').data('slug')).toBe('first/second/not-third')

      expect($('[data-layout="/"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/[first]"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/[first]/[second]"]').data('sentinel')).toBe(
        'buildtime'
      )
      expect(
        $('[data-layout="/[first]/[second]/[third]"]').data('sentinel')
      ).toBe('runtime')

      // Then we try to load a page that'll use the `/first/[second]/[third]`
      $ = await next.render$('/first/not-second/not-third')

      expect($('[data-slug]').data('slug')).toBe('first/not-second/not-third')

      expect($('[data-layout="/"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/[first]"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/[first]/[second]"]').data('sentinel')).toBe(
        'runtime'
      )
      expect(
        $('[data-layout="/[first]/[second]/[third]"]').data('sentinel')
      ).toBe('runtime')

      // Then we try to load a page that'll use the `/[first]/[second]/[third]`
      $ = await next.render$('/not-first/not-second/not-third')

      expect($('[data-slug]').data('slug')).toBe(
        'not-first/not-second/not-third'
      )

      expect($('[data-layout="/"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/[first]"]').data('sentinel')).toBe('runtime')
      expect($('[data-layout="/[first]/[second]"]').data('sentinel')).toBe(
        'runtime'
      )
      expect(
        $('[data-layout="/[first]/[second]/[third]"]').data('sentinel')
      ).toBe('runtime')
    })

    it('should handle middleware rewrites as well', async () => {
      let res = await next.fetch('/not-broken')

      expect(res.status).toBe(200)

      if (isNextDeploy) {
        expect(res.headers.get('x-vercel-cache')).toMatch(/MISS|HIT|PRERENDER/)
      } else {
        expect(res.headers.get('x-nextjs-cache')).toBe(null)
      }

      let html = await res.text()
      let $ = cheerio.load(html)

      expect($('[data-layout="/"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/rewrite"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/rewrite/[slug]"]').data('sentinel')).toBe(
        'runtime'
      )

      await retry(async () => {
        res = await next.fetch('/not-broken')

        expect(res.status).toBe(200)
        if (isNextDeploy) {
          expect(res.headers.get('x-vercel-cache')).toBe('HIT')
        } else {
          expect(res.headers.get('x-nextjs-cache')).toBe(null)
        }
      })

      html = await res.text()
      $ = cheerio.load(html)

      expect($('[data-rewrite-slug]').data('rewrite-slug')).toBe('not-broken')

      expect($('[data-layout="/"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/rewrite"]').data('sentinel')).toBe('buildtime')
      expect($('[data-layout="/rewrite/[slug]"]').data('sentinel')).toBe(
        'runtime'
      )
    })

    it('should revalidate the overview page without replacing it with a 404', async () => {
      const url = new URL('/my-team', 'http://localhost')
      const rsc = computeCacheBustingSearchParam(
        '1',
        '/_tree',
        undefined,
        undefined
      )

      url.searchParams.set('_rsc', rsc)

      let res = await next.fetch(url.pathname + url.search, {
        headers: {
          Cookie: 'overview-param=grid',
          RSC: '1',
          'Next-Router-Prefetch': '1',
          'Next-Router-Segment-Prefetch': '/_tree',
        },
      })

      // A 404 here represents a routing issue that was resolved by an upstream
      // PR in the builder: https://github.com/vercel/vercel/pull/13927
      expect(res.status).toBe(200)

      // Now, let's verify that we both got rewritten to the correct page, and
      // that we're being served the prerender shell.
      expect(res.headers.get('x-nextjs-rewritten-path')).toBe(
        '/my-team/~/overview/grid'
      )
      expect(res.headers.get('x-nextjs-postponed')).toBe('2')
      expect(res.headers.get('x-nextjs-prerender')).toBe('1')

      // Grab the RSC content.
      const rsc1 = await res.text()

      // Grab the title which includes the random number.
      const title1 = rsc1.match(/Grid Page (\d+\.\d+)/)?.[1]
      expect(title1).toBeDefined()

      // Now, let's trigger a revalidation for the page.
      res = await next.fetch(
        '/api?path=/my-team&path=/my-team/~/overview/grid&path=/[first]/~/overview/grid'
      )

      // Now, let's keep polling the prefetch until it's revalidated.
      let rsc2: string
      await retry(async () => {
        res = await next.fetch(url.pathname + url.search, {
          headers: {
            Cookie: 'overview-param=grid',
            RSC: '1',
            'Next-Router-Prefetch': '1',
            'Next-Router-Segment-Prefetch': '/_tree',
          },
        })

        // A 404 here represents a routing issue that was resolved by an upstream
        // PR in the builder: https://github.com/vercel/vercel/pull/13927
        expect(res.status).toBe(200)

        // We're expecting that the title has changed, so let's compare that the
        // rsc payload is different.
        rsc2 = await res.text()
        expect(rsc1).not.toBe(rsc2)
      })

      // Now that the revalidation has been completed, let's also verify that
      // it revalidated correctly.
      expect(res.headers.get('x-nextjs-postponed')).toBe('2')
      expect(res.headers.get('x-nextjs-rewritten-path')).toBe(
        '/my-team/~/overview/grid'
      )

      // We expect that the only difference between the two RSC contents is the
      // title.
      const title2 = rsc2.match(/Grid Page (\d+\.\d+)/)?.[1]
      expect(title2).toBeDefined()
      expect(title2).not.toBe(title1)

      // Let's compare the RSC contents, with the titles removed.
      const cleaned1 = rsc1.replace(/Grid Page (\d+\.\d+)/, 'Grid Page')
      const cleaned2 = rsc2.replace(/Grid Page (\d+\.\d+)/, 'Grid Page')
      expect(cleaned1).toBe(cleaned2)
    })
  } else {
    // Here we're validating that there is a static page generated for the
    // rewritten path.
    it('should eventually result in a cache hit', async () => {
      let res = await next.fetch('/not-broken')

      expect(res.status).toBe(200)
      expect(
        res.headers.get(isNextDeploy ? 'x-vercel-cache' : 'x-nextjs-cache')
      ).toMatch(/MISS|HIT|PRERENDER/)

      let html = await res.text()
      let $ = cheerio.load(html)

      expect($('[data-layout="/"]').data('sentinel')).toBe('runtime')
      expect($('[data-layout="/rewrite"]').data('sentinel')).toBe('runtime')
      expect($('[data-layout="/rewrite/[slug]"]').data('sentinel')).toBe(
        'runtime'
      )

      await retry(async () => {
        res = await next.fetch('/not-broken')

        expect(res.status).toBe(200)
        expect(
          res.headers.get(isNextDeploy ? 'x-vercel-cache' : 'x-nextjs-cache')
        ).toBe('HIT')
      })

      html = await res.text()
      $ = cheerio.load(html)

      expect($('[data-rewrite-slug]').data('rewrite-slug')).toBe('not-broken')

      expect($('[data-layout="/"]').data('sentinel')).toBe('runtime')
      expect($('[data-layout="/rewrite"]').data('sentinel')).toBe('runtime')
      expect($('[data-layout="/rewrite/[slug]"]').data('sentinel')).toBe(
        'runtime'
      )
    })
  }
})
