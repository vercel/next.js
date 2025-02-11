import { nextTestSetup } from 'e2e-utils'

const isPPREnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

// PPR tests are covered in test/e2e/app-dir/ppr-metadata-blocking
;(isPPREnabled ? describe.skip : describe)(
  'app-dir - metadata-static-generation',
  () => {
    const { next, isNextStart } = nextTestSetup({
      files: __dirname,
    })

    if (isNextStart) {
      // Precondition for the following tests in build mode.
      // This test is only useful for non-PPR mode as in PPR mode those routes
      // are all listed in the prerender manifest.
      it('should generate all pages static', async () => {
        const prerenderManifest = JSON.parse(
          await next.readFile('.next/prerender-manifest.json')
        )
        const staticRoutes = prerenderManifest.routes
        expect(Object.keys(staticRoutes).sort()).toEqual([
          '/',
          '/suspenseful/static',
        ])
      })
    }

    it('should contain async generated metadata in head for simple static page', async () => {
      const $ = await next.render$('/')
      expect($('head title').text()).toBe('index page')
      expect($('head meta[name="description"]').attr('content')).toBe(
        'index page description'
      )
    })

    it('should contain async generated metadata in head static page with suspenseful content', async () => {
      const $ = await next.render$('/suspenseful/static')
      expect($('head title').text()).toBe('suspenseful page - static')
    })

    it('should contain async generated metadata in head for dynamic page', async () => {
      const $ = await next.render$('/suspenseful/dynamic')
      expect($('head title').text()).toBe('suspenseful page - dynamic')
    })
  }
)
