import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('SSG notFound revalidate', () => {
  describe.each(['static', 'dynamic'])('%s 404', (type) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: { 'fs-extra': 'latest' },
      overrideFiles:
        type === 'dynamic'
          ? {
              'pages/404.js': `export default function Page(props) {
  return (
    <>
      <p id="not-found">404 page</p>
      <p id="props">{JSON.stringify({notFound: true})}</p>
    </>
  )
}
`,
            }
          : undefined,
    })

    it('should correctly render 404', async () => {
      {
        let res = await next.fetch('/always-not-found/first')
        let $ = await next.render$('/always-not-found/first')
        expect(res.status).toBe(404)
        expect($('#not-found').text()).toBe('404 page')
      }
      {
        let res = await next.fetch('/always-not-found/second')
        let $ = await next.render$('/always-not-found/second')
        expect(res.status).toBe(404)
        expect($('#not-found').text()).toBe('404 page')
      }
      {
        let res = await next.fetch('/always-not-found')
        let $ = await next.render$('/always-not-found')
        expect(res.status).toBe(404)
        expect($('#not-found').text()).toBe('404 page')
      }
    })

    // TODO these currently rely on local FS modifications, but should ideally also run when deployed
    if (isNextStart) {
      it('should revalidate page when notFound returned during build', async () => {
        let res = await next.fetch('/initial-not-found/first')
        let $ = await next.render$('/initial-not-found/first')
        expect(res.status).toBe(404)
        expect($('#not-found').text()).toBe('404 page')

        res = await next.fetch('/initial-not-found/second')
        $ = await next.render$('/initial-not-found/second')
        expect(res.status).toBe(404)
        expect($('#not-found').text()).toBe('404 page')

        res = await next.fetch('/initial-not-found')
        $ = await next.render$('/initial-not-found')
        expect(res.status).toBe(404)
        expect($('#not-found').text()).toBe('404 page')

        await next.patchFile('data.txt', '200')

        try {
          await retry(async () => {
            const r = await next.fetch('/initial-not-found/first')
            const $r = await next.render$('/initial-not-found/first')
            expect(r.status).toBe(200)
            expect($r('#data').text()).toBe('200')
          })

          await retry(async () => {
            const r = await next.fetch('/initial-not-found/second')
            const $r = await next.render$('/initial-not-found/second')
            expect(r.status).toBe(200)
            expect($r('#data').text()).toBe('200')
          })

          await retry(async () => {
            const r = await next.fetch('/initial-not-found')
            const $r = await next.render$('/initial-not-found')
            expect(r.status).toBe(200)
            expect($r('#data').text()).toBe('200')
          })
        } finally {
          await next.patchFile('data.txt', '404')
        }
      })

      it('should revalidate after notFound is returned for fallback: blocking', async () => {
        let res = await next.fetch('/fallback-blocking/hello')
        let $ = await next.render$('/fallback-blocking/hello')

        expect(res.headers.get('cache-control')).toBe(
          isNextDev
            ? 'no-cache, must-revalidate'
            : 's-maxage=1, stale-while-revalidate=31535999'
        )
        expect(res.status).toBe(404)
        expect(JSON.parse($('#props').text()).notFound).toBe(true)

        await retry(async () => {
          res = await next.fetch('/fallback-blocking/hello')
          $ = await next.render$('/fallback-blocking/hello')
          expect(res.headers.get('cache-control')).toBe(
            isNextDev
              ? 'no-cache, must-revalidate'
              : 's-maxage=1, stale-while-revalidate=31535999'
          )
          expect(res.status).toBe(200)
          const p = JSON.parse($('#props').text())
          expect(p.found).toBe(true)
          expect(p.params).toEqual({ slug: 'hello' })
          expect(isNaN(p.random)).toBe(false)
        })

        const props = JSON.parse($('#props').text())

        await retry(async () => {
          const r = await next.fetch('/fallback-blocking/hello')
          const $r = await next.render$('/fallback-blocking/hello')
          const p = JSON.parse($r('#props').text())
          expect(r.headers.get('cache-control')).toBe(
            isNextDev
              ? 'no-cache, must-revalidate'
              : 's-maxage=1, stale-while-revalidate=31535999'
          )
          expect(r.status).toBe(200)
          expect(p.found).toBe(true)
          expect(p.params).toEqual({ slug: 'hello' })
          expect(isNaN(p.random)).toBe(false)
          expect(p.random).not.toBe(props.random)
        })
      })

      it('should revalidate after notFound is returned for fallback: true', async () => {
        const browser = await next.browser('/fallback-true/world')
        await browser.waitForElementByCss('#not-found')

        await retry(async () => {
          const res = await next.fetch('/fallback-true/world')
          expect(res.headers.get('cache-control')).toBe(
            isNextDev
              ? 'no-cache, must-revalidate'
              : 's-maxage=1, stale-while-revalidate=31535999'
          )
          expect(res.status).toBe(404)
          const $ = await next.render$('/fallback-true/world')
          expect(JSON.parse($('#props').text()).notFound).toBe(true)
        })

        await retry(async () => {
          const res = await next.fetch('/fallback-true/world')
          const $ = await next.render$('/fallback-true/world')
          const props = JSON.parse($('#props').text())
          expect(res.headers.get('cache-control')).toBe(
            isNextDev
              ? 'no-cache, must-revalidate'
              : 's-maxage=1, stale-while-revalidate=31535999'
          )
          expect(res.status).toBe(200)
          expect(props.found).toBe(true)
          expect(props.params).toEqual({ slug: 'world' })
          expect(isNaN(props.random)).toBe(false)
        })

        const $ = await next.render$('/fallback-true/world')
        const props = JSON.parse($('#props').text())

        await retry(async () => {
          const r = await next.fetch('/fallback-true/world')
          const $r = await next.render$('/fallback-true/world')
          const props3 = JSON.parse($r('#props').text())
          expect(r.headers.get('cache-control')).toBe(
            isNextDev
              ? 'no-cache, must-revalidate'
              : 's-maxage=1, stale-while-revalidate=31535999'
          )
          expect(r.status).toBe(200)
          expect(props3.found).toBe(true)
          expect(props3.params).toEqual({ slug: 'world' })
          expect(isNaN(props3.random)).toBe(false)
          expect(props3.random).not.toBe(props.random)
        })
      })
    }
  })
})
