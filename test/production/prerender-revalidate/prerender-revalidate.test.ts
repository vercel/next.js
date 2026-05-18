import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('SSG Prerender Revalidate', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function runTests(route: string) {
    it(`[${route}] should regenerate page when revalidate time exceeded`, async () => {
      const initialHtml = await next.render(route)

      await retry(async () => {
        const newHtml = await next.render(route)
        expect(newHtml).not.toBe(initialHtml)
      })
    })

    it(`[${route}] should regenerate /_next/data when revalidate time exceeded`, async () => {
      const dataRoute = `/_next/data/${next.buildId}${route === '/' ? '/index' : route}.json`
      const initialData = await next.render(dataRoute)

      await retry(async () => {
        const newData = await next.render(dataRoute)
        expect(newData).not.toBe(initialData)
      })
    })
  }

  runTests('/')
  runTests('/named')
  runTests('/nested')
  runTests('/nested/named')

  it('should return cache-control header on 304 status', async () => {
    const res1 = await next.fetch('/static')
    const cacheControl200 = res1.headers.get('Cache-Control')
    const etag = res1.headers.get('ETag')

    const res2 = await next.fetch('/static', {
      headers: { 'If-None-Match': etag },
    })
    const cacheControl304 = res2.headers.get('Cache-Control')
    expect(cacheControl304).toEqual(cacheControl200)
  })
})

describe('[regression] production mode and incremental cache size exceeded', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { __NEXT_TEST_MAX_ISR_CACHE: '1' },
  })

  function runTests(route: string) {
    it(`[${route}] should regenerate page when revalidate time exceeded`, async () => {
      const initialHtml = await next.render(route)

      await retry(async () => {
        const newHtml = await next.render(route)
        expect(newHtml).not.toBe(initialHtml)
      })
    })

    it(`[${route}] should regenerate /_next/data when revalidate time exceeded`, async () => {
      const dataRoute = `/_next/data/${next.buildId}${route === '/' ? '/index' : route}.json`
      const initialData = await next.render(dataRoute)

      await retry(async () => {
        const newData = await next.render(dataRoute)
        expect(newData).not.toBe(initialData)
      })
    })
  }

  runTests('/')
  runTests('/named')
  runTests('/nested')
  runTests('/nested/named')
})
