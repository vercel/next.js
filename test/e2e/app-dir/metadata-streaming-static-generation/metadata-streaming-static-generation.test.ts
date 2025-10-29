import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isPPREnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

// Skip PPR test as it's covered in test/e2e/app-dir/ppr-metadata-streaming/ppr-metadata-streaming.test.ts
;(isPPREnabled ? describe.skip : describe)(
  'app-dir - metadata-streaming-static-generation',
  () => {
    const { next, isNextDev, isNextStart } = nextTestSetup({
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
          '/_global-error',
          '/_not-found',
          '/slow/static',
          '/suspenseful/static',
        ])
      })
    }

    if (isNextDev) {
      // In development it's still dynamic rendering that metadata will be inserted into body
      describe('static pages (development)', () => {
        it('should contain async generated metadata in body for simple static page', async () => {
          const $ = await next.render$('/')
          expect($('body title').text()).toBe('index page')
        })

        it('should contain async generated metadata in body for slow static page', async () => {
          const $ = await next.render$('/slow/static')
          expect($('body title').text()).toBe('slow page - static')
        })

        it('should contain async generated metadata in body static page with suspenseful content', async () => {
          const $ = await next.render$('/suspenseful/static')
          expect($('body title').text()).toBe('suspenseful page - static')
        })
      })
    } else {
      describe('static pages (production)', () => {
        it('should contain async generated metadata in head for simple static page', async () => {
          const $ = await next.render$('/')
          expect($('head title').text()).toBe('index page')
        })

        it('should contain async generated metadata in head for slow static page', async () => {
          const $ = await next.render$('/slow/static')
          expect($('head title').text()).toBe('slow page - static')
        })

        it('should contain async generated metadata in head static page with suspenseful content', async () => {
          const $ = await next.render$('/suspenseful/static')
          expect($('head title').text()).toBe('suspenseful page - static')
        })
      })
    }

    describe('dynamic pages', () => {
      it('should contain async generated metadata in body for simple dynamics page', async () => {
        const $ = await next.render$('/suspenseful/dynamic')
        expect($('body title').text()).toBe('suspenseful page - dynamic')
      })

      it('should contain async generated metadata in body for suspenseful dynamic page', async () => {
        const $ = await next.render$('/slow/dynamic')
        expect($('body title').text()).toBe('slow page - dynamic')
      })
    })

    describe('dynamic pages with html limited bots', () => {
      it('should contain stream metadata in head for suspenseful dynamic page', async () => {
        const $ = await next.render$('/suspenseful/dynamic', undefined, {
          headers: {
            'User-Agent': 'Discordbot/2.0;',
          },
        })
        expect($('head title').text()).toBe('suspenseful page - dynamic')
        // Ensure it's suspenseful content
        expect($('.suspenseful-layout').text()).toBe('')

        // Can still render the suspenseful content with browser
        const browser = await next.browser('/suspenseful/dynamic')
        await retry(async () => {
          expect(await browser.elementByCss('.suspenseful-layout').text()).toBe(
            'suspenseful - dynamic'
          )
        })
      })

      it('should contain async generated metadata in head for simple dynamic page', async () => {
        const $ = await next.render$('/slow/dynamic', undefined, {
          headers: {
            'User-Agent': 'Discordbot/2.0;',
          },
        })
        expect($('head title').text()).toBe('slow page - dynamic')
      })
    })
  }
)
