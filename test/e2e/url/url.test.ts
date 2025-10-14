import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

// |         | Pages Client            | Pages Server (SSR,RSC)  | API Routes/Middleware/Metadata |
// |---------|-------------------------|-------------------------|--------------------------------|
// | new URL | /_next/static/media/... | /_next/static/media/... | /server/assets/...             |
// | import  | /_next/static/media/... | /_next/static/media/... | /_next/static/media/...        |
// |---------|-------------------------|-------------------------|--------------------------------|
//
// Webpack has
// - a bug where App Router API routes (and Metadata) return client assets for `new URL`s.
// - a bug where Edge Page routes return client assets for `new URL`s.
describe(`Handle new URL asset references`, () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Workaround for `Error: invariant: htmlFsRef != null && jsonFsRef != null /ssg` errors
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  const serverFilePath = expect.stringMatching(
    /file:.*\/.next(\/dev)?\/server\/.*\/vercel\.[0-9a-f]{8}\.png$/
  )
  const serverEdgeUrl = expect.stringMatching(
    /^blob:.*vercel\.[0-9a-f]{8,}\.png$/
  )
  const clientFilePath = expect.stringMatching(
    /^\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png$/
  )

  it('should respond on middleware api', async () => {
    const data = await next
      .fetch('/middleware')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({
      imported: expect.objectContaining({
        src: clientFilePath,
      }),
      url: serverEdgeUrl,
    })
  })

  const expectedPage =
    /^Hello \/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png(\+\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png(\+\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png)?)?$/

  describe('app router', () => {
    it('should respond on webmanifest', async () => {
      const data = await next
        .fetch('/manifest.webmanifest')
        .then((res) => res.ok && res.json())

      expect(data).toEqual({
        short_name: 'Next.js',
        name: 'Next.js',
        icons: [
          {
            src: clientFilePath,
            type: 'image/png',
            sizes: '512x512',
          },
        ],
        // TODO Webpack bug?
        description: process.env.IS_TURBOPACK_TEST
          ? serverFilePath
          : clientFilePath,
      })
    })

    it('should respond on opengraph-image', async () => {
      const data = await next
        .fetch('/opengraph-image')
        .then((res) => res.ok && res.json())

      expect(data).toEqual({
        imported: expect.objectContaining({
          src: clientFilePath,
        }),
        // TODO Webpack bug?
        url: process.env.IS_TURBOPACK_TEST ? serverFilePath : clientFilePath,
      })
    })

    for (const page of ['/rsc', '/rsc-edge', '/client', '/client-edge']) {
      // TODO Webpack bug?
      let shouldSkip = process.env.IS_TURBOPACK_TEST
        ? false
        : page.includes('edge')

      ;(shouldSkip ? it.skip : it)(
        `should render the ${page} page`,
        async () => {
          const $ = await next.render$(page)
          // eslint-disable-next-line jest/no-standalone-expect
          expect($('main').text()).toMatch(expectedPage)
        }
      )
      ;(shouldSkip ? it.skip : it)(
        `should client-render the ${page} page`,
        async () => {
          const browser = await next.browser(page)
          await retry(async () =>
            expect(await browser.elementByCss('main').text()).toMatch(
              expectedPage
            )
          )
        }
      )
    }

    it('should respond on API', async () => {
      const data = await next.fetch('/api').then((res) => res.ok && res.json())

      expect(data).toEqual({
        imported: expect.objectContaining({
          src: clientFilePath,
        }),
        // TODO Webpack bug?
        url: process.env.IS_TURBOPACK_TEST ? serverFilePath : clientFilePath,
      })
    })
  })

  describe('pages router', () => {
    for (const page of [
      '/pages/static',
      '/pages/ssr',
      '/pages/ssg',
      '/pages-edge/static',
      '/pages-edge/ssr',
    ]) {
      // TODO Webpack bug?
      let shouldSkip = process.env.IS_TURBOPACK_TEST
        ? false
        : page.includes('edge')

      ;(shouldSkip ? it.skip : it)(
        `should render the ${page} page`,
        async () => {
          const $ = await next.render$(page)
          // eslint-disable-next-line jest/no-standalone-expect
          expect($('main').text()).toMatch(expectedPage)
        }
      )
      ;(shouldSkip ? it.skip : it)(
        `should client-render the ${page} page`,
        async () => {
          const browser = await next.browser(page)
          await retry(async () =>
            expect(await browser.elementByCss('main').text()).toMatch(
              expectedPage
            )
          )
        }
      )
    }

    it('should respond on API', async () => {
      const data = await next
        .fetch('/api/pages/')
        .then((res) => res.ok && res.json())

      expect(data).toEqual({
        imported: expect.objectContaining({
          src: clientFilePath,
        }),
        url: serverFilePath,
        size: 30079,
      })
    })

    it('should respond on edge API', async () => {
      const data = await next
        .fetch('/api/pages-edge/')
        .then((res) => res.ok && res.json())

      expect(data).toEqual({
        imported: expect.objectContaining({
          src: clientFilePath,
        }),
        url: serverEdgeUrl,
      })
    })
  })
})
