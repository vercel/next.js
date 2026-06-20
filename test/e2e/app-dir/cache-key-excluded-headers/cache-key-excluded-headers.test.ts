import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('cacheKeyExcludedHeaders', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('global config — experimental.cacheKeyExcludedHeaders', () => {
    it('excluded header: differing values → cache HIT (same response body)', async () => {
      // The fixture at /global-excluded fetches the same URL twice, each time
      // with a different x-request-id value.  Because x-request-id is listed
      // in experimental.cacheKeyExcludedHeaders, both fetches should resolve
      // to the same cached random value.
      const res = await next.fetch('/global-excluded')
      expect(res.status).toBe(200)

      const $ = cheerio.load(await res.text())

      await retry(async () => {
        const data1 = $('#data1').text()
        const data2 = $('#data2').text()
        expect(data1).toBeTruthy()
        expect(data1).toBe(data2)
      })
    })
  })

  describe('per-fetch — next.cacheKeyExcludedHeaders', () => {
    it('excluded header: differing values → cache HIT (same response body)', async () => {
      // The fixture at /per-fetch-excluded specifies cacheKeyExcludedHeaders
      // inline on each fetch call.  Differing x-trace values should still
      // resolve to the same cached random value.
      const res = await next.fetch('/per-fetch-excluded')
      expect(res.status).toBe(200)

      const $ = cheerio.load(await res.text())

      await retry(async () => {
        const data1 = $('#data1').text()
        const data2 = $('#data2').text()
        expect(data1).toBeTruthy()
        expect(data1).toBe(data2)
      })
    })
  })

  describe('non-excluded header', () => {
    it('differing values → cache MISS (different response bodies)', async () => {
      // The fixture at /non-excluded fetches the same URL twice with different
      // x-custom values.  x-custom is NOT excluded so the two fetches land on
      // different cache keys → different random values.
      const res = await next.fetch('/non-excluded')
      expect(res.status).toBe(200)

      const $ = cheerio.load(await res.text())

      await retry(async () => {
        const data1 = $('#data1').text()
        const data2 = $('#data2').text()
        expect(data1).toBeTruthy()
        expect(data2).toBeTruthy()
        expect(data1).not.toBe(data2)
      })
    })
  })
})
