import { createNextDescribe } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import cheerio from 'cheerio'

createNextDescribe(
  'app dir rendering',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev: isDev }) => {
    it('should serve app/page.server.js at /', async () => {
      const html = await next.render('/')
      expect(html).toContain('app/page.server.js')
    })

    describe('SSR only', () => {
      it('should run data in layout and page', async () => {
        const $ = await next.render$('/ssr-only/nested')
        expect($('#layout-message').text()).toBe('hello from layout')
        expect($('#page-message').text()).toBe('hello from page')
      })

      it('should run data fetch in parallel', async () => {
        const startTime = Date.now()
        const $ = await next.render$('/ssr-only/slow')
        const endTime = Date.now()
        const duration = endTime - startTime
        // Each part takes 5 seconds so it should be below 10 seconds
        // Using 7 seconds to ensure external factors causing slight slowness don't fail the tests
        expect(duration).toBeLessThan(10_000)
        expect($('#slow-layout-message').text()).toBe('hello from slow layout')
        expect($('#slow-page-message').text()).toBe('hello from slow page')
      })
    })

    describe('static only', () => {
      it('should run data in layout and page', async () => {
        const $ = await next.render$('/static-only/nested')
        expect($('#layout-message').text()).toBe('hello from layout')
        expect($('#page-message').text()).toBe('hello from page')
      })

      it(`should run data in parallel ${
        isDev ? 'during development' : 'and use cached version for production'
      }`, async () => {
        // const startTime = Date.now()
        const $ = await next.render$('/static-only/slow')
        // const endTime = Date.now()
        // const duration = endTime - startTime
        // Each part takes 5 seconds so it should be below 10 seconds
        // Using 7 seconds to ensure external factors causing slight slowness don't fail the tests
        // TODO: cache static props in prod
        // expect(duration < (isDev ? 7000 : 2000)).toBe(true)
        // expect(duration < 7000).toBe(true)
        expect($('#slow-layout-message').text()).toBe('hello from slow layout')
        expect($('#slow-page-message').text()).toBe('hello from slow page')
      })
    })

    describe('ISR', () => {
      it('should revalidate the page when revalidate is configured', async () => {
        const getPage = async () => {
          const res = await next.fetch('isr-multiple/nested')
          const html = await res.text()

          return {
            $: cheerio.load(html),
            cacheHeader: res.headers['x-nextjs-cache'],
          }
        }
        const { $ } = await getPage()
        expect($('#layout-message').text()).toBe('hello from layout')
        expect($('#page-message').text()).toBe('hello from page')

        const layoutNow = $('#layout-now').text()
        const pageNow = $('#page-now').text()

        await waitFor(2000)

        // TODO: implement
        // Trigger revalidate
        // const { cacheHeader: revalidateCacheHeader } = await getPage()
        // expect(revalidateCacheHeader).toBe('STALE')

        // TODO: implement
        const { $: $revalidated /* cacheHeader: revalidatedCacheHeader */ } =
          await getPage()
        // expect(revalidatedCacheHeader).toBe('REVALIDATED')

        const layoutNowRevalidated = $revalidated('#layout-now').text()
        const pageNowRevalidated = $revalidated('#page-now').text()

        // Expect that the `Date.now()` is different as the page have been regenerated
        expect(layoutNow).not.toBe(layoutNowRevalidated)
        expect(pageNow).not.toBe(pageNowRevalidated)
      })
    })

    // TODO: implement
    describe.skip('mixed static and dynamic', () => {
      it('should generate static data during build and use it', async () => {
        const getPage = async () => {
          const $ = await next.render$('isr-ssr-combined/nested')

          return {
            $,
          }
        }
        const { $ } = await getPage()
        expect($('#layout-message').text()).toBe('hello from layout')
        expect($('#page-message').text()).toBe('hello from page')

        const layoutNow = $('#layout-now').text()
        const pageNow = $('#page-now').text()

        const { $: $second } = await getPage()

        const layoutNowSecond = $second('#layout-now').text()
        const pageNowSecond = $second('#page-now').text()

        // Expect that the `Date.now()` is different as it came from getServerSideProps
        expect(layoutNow).not.toBe(layoutNowSecond)
        // Expect that the `Date.now()` is the same as it came from getStaticProps
        expect(pageNow).toBe(pageNowSecond)
      })
    })
  }
)
