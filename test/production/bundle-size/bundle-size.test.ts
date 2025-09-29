import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import getGzipSize from 'next/dist/compiled/gzip-size'

describe('bundle-size', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // TODO bring these numbers down for Turbopack, especially the softnav one
  // TODO these numbers simply change too often right now
  const BASE_SIZES = {
    pages: undefined, // process.env.IS_TURBOPACK_TEST ? 111_000 : 101_000,
    app: undefined, // process.env.IS_TURBOPACK_TEST ? 119_000 : 106_000,
    appClient: undefined, // process.env.IS_TURBOPACK_TEST ? 123_000 : 110_000,
  }
  it.each([
    {
      title: 'Pages Router: between identical pages',
      from: '/pages/a',
      to: '/pages/b',
      fromInitialJs: BASE_SIZES.pages,
      toInitialJs: BASE_SIZES.pages,
      softNavJs: process.env.IS_TURBOPACK_TEST ? 12_000 : 500,
    },
    {
      title: 'App Router: between RSC-only identical pages',
      from: '/app/a',
      to: '/app/b',
      fromInitialJs: BASE_SIZES.app,
      toInitialJs: BASE_SIZES.app,
      softNavJs: process.env.IS_TURBOPACK_TEST ? 0 : 1000,
    },
    {
      title: 'App Router: adding a client component',
      from: '/app/a',
      to: '/app/client-b',
      fromInitialJs: BASE_SIZES.app,
      toInitialJs: BASE_SIZES.appClient,
      softNavJs: process.env.IS_TURBOPACK_TEST ? 8_000 : 5_000,
    },
    {
      title: 'App Router: between identical pages with a client component',
      from: '/app/client-a',
      to: '/app/client-b',
      fromInitialJs: BASE_SIZES.appClient,
      toInitialJs: BASE_SIZES.appClient,
      softNavJs: process.env.IS_TURBOPACK_TEST ? 0 : 0,
    },
  ])(
    'should not load too much: $title',
    async ({ from, fromInitialJs, to, softNavJs, toInitialJs }) => {
      {
        let jsResources = []

        const browser = await next.browser(from, {
          beforePageLoad(page) {
            page.on('response', async (res) => {
              if (
                res.url().includes('static/chunks') &&
                res.url().endsWith('.js')
              ) {
                jsResources.push(res.text())
              }
            })
          },
        })

        await retry(async () => {
          expect(await browser.elementByCss('main').text()).toContain(
            'this is a'
          )
        })

        let initialJsResourceSize = await getResourceSize(jsResources)

        expect(initialJsResourceSize).toBeGreaterThan(10_000)
        if (fromInitialJs !== undefined) {
          expect(initialJsResourceSize).toBeLessThanOrEqual(fromInitialJs)
        }

        jsResources = []

        await browser.elementByCss(`[href="${to}"]`).click()
        await retry(async () => {
          expect(await browser.elementByCss('main').text()).toContain(
            'this is b'
          )
        })

        let softNavJsResourceSize = await getResourceSize(jsResources)

        expect(softNavJsResourceSize).toBeLessThanOrEqual(softNavJs)
      }

      {
        let jsResources = []
        let browser = await next.browser(to, {
          beforePageLoad(page) {
            page.on('response', async (res) => {
              if (
                res.url().includes('static/chunks') &&
                res.url().endsWith('.js')
              ) {
                jsResources.push(res.text())
              }
            })
          },
        })
        await retry(async () => {
          expect(await browser.elementByCss('main').text()).toContain(
            'this is b'
          )
        })

        let initialJsResourceSize = await getResourceSize(jsResources)

        expect(initialJsResourceSize).toBeGreaterThan(10_000)
        if (toInitialJs !== undefined) {
          expect(initialJsResourceSize).toBeLessThanOrEqual(toInitialJs)
        }
      }
    }
  )
})

function getResourceSize(resources: Promise<string>[]) {
  return Promise.all(resources).then((resources) =>
    resources.reduce((acc, r) => acc + getGzipSize.sync(Buffer.from(r)), 0)
  )
}
