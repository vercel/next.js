import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP, fetchViaHTTP, waitFor } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'

describe('views dir rendering', () => {
  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }

  const isDev = (global as any).isDev
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        views: new FileRef(path.join(__dirname, 'app-rendering/views')),
        pages: new FileRef(path.join(__dirname, 'app-rendering/pages')),
        'next.config.js': new FileRef(
          path.join(__dirname, 'app-rendering/next.config.js')
        ),
      },
    })
  })
  afterAll(() => next.destroy())

  describe('getServerSideProps only', () => {
    it('should run getServerSideProps in layout and page', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/getserversideprops-only/nested'
      )
      const $ = cheerio.load(html)
      expect($('#layout-message').text()).toBe('hello from layout')
      expect($('#page-message').text()).toBe('hello from page')
    })

    it('should run getServerSideProps in parallel', async () => {
      const startTime = Date.now()
      const html = await renderViaHTTP(
        next.url,
        '/getserversideprops-only/slow'
      )
      const endTime = Date.now()
      const duration = endTime - startTime
      // Each part takes 5 seconds so it should be below 10 seconds
      // Using 7 seconds to ensure external factors causing slight slowness don't fail the tests
      expect(duration < 7000).toBe(true)
      const $ = cheerio.load(html)
      expect($('#slow-layout-message').text()).toBe('hello from slow layout')
      expect($('#slow-page-message').text()).toBe('hello from slow page')
    })
  })

  describe('getStaticProps only', () => {
    it('should run getStaticProps in layout and page', async () => {
      const html = await renderViaHTTP(next.url, '/getstaticprops-only/nested')
      const $ = cheerio.load(html)
      expect($('#layout-message').text()).toBe('hello from layout')
      expect($('#page-message').text()).toBe('hello from page')
    })

    it(`should run getStaticProps in parallel ${
      isDev ? 'during development' : 'and use cached version for production'
    }`, async () => {
      const startTime = Date.now()
      const html = await renderViaHTTP(next.url, '/getstaticprops-only/slow')
      const endTime = Date.now()
      const duration = endTime - startTime
      // Each part takes 5 seconds so it should be below 10 seconds
      // Using 7 seconds to ensure external factors causing slight slowness don't fail the tests
      // TODO: cache static props in prod
      // expect(duration < (isDev ? 7000 : 2000)).toBe(true)
      expect(duration < 7000).toBe(true)
      const $ = cheerio.load(html)
      expect($('#slow-layout-message').text()).toBe('hello from slow layout')
      expect($('#slow-page-message').text()).toBe('hello from slow page')
    })
  })

  describe('getStaticProps ISR', () => {
    it('should revalidate the page when getStaticProps return revalidate', async () => {
      const getPage = async () => {
        const res = await fetchViaHTTP(
          next.url,
          'getstaticprops-isr-multiple/nested'
        )
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
})
