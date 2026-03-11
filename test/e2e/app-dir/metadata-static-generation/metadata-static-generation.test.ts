import { nextTestSetup } from 'e2e-utils'

const isPPREnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

;(isPPREnabled ? describe.skip : describe)(
  'app-dir - metadata-static-generation',
  () => {
    const { next, isNextDev, isNextStart } = nextTestSetup({
      files: __dirname,
    })

    // In dev, it suspenses as dynamic rendering so it's inserted into body;
    // In build, it's resolved as static rendering so it's inserted into head.
    const rootSelector = isNextDev ? 'body' : 'head'

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
          '/_global-error',
          '/_not-found',
          '/suspenseful/static',
        ])
      })
    }

    it('should contain async generated metadata in head for simple static page', async () => {
      const $ = await next.render$('/')
      expect($(`${rootSelector} title`).text()).toBe('index page')
      expect(
        $(`${rootSelector} meta[name="description"]`).attr('content')
      ).toBe('index page description')
    })

    it('should contain async generated metadata in head static page with suspenseful content', async () => {
      const $ = await next.render$('/suspenseful/static')
      expect($(`${rootSelector} title`).text()).toBe(
        'suspenseful page - static'
      )
    })

    it('should contain async generated metadata in body for dynamic page', async () => {
      const $ = await next.render$('/suspenseful/dynamic')
      expect($('body title').text()).toBe('suspenseful page - dynamic')
    })
  }
)
