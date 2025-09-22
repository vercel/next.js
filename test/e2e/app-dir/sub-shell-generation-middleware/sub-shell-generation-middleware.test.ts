import { nextTestSetup } from 'e2e-utils'
import * as cheerio from 'cheerio'
import { retry } from 'next-test-utils'

describe('middleware-static-rewrite', () => {
  const { next, isNextDeploy, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it.skip('skipping dev test', () => {})
    return
  }

  if (
    process.env.__NEXT_EXPERIMENTAL_CACHE_COMPONENTS === 'true' ||
    process.env.__NEXT_EXPERIMENTAL_PPR === 'true'
  ) {
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
