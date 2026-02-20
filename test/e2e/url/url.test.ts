import { retry } from 'next-test-utils'
import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'

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
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    env: {
      // rely on skew protection when deployed
      NEXT_DEPLOYMENT_ID: isNextStart ? 'test-deployment-id' : undefined,
    },
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  const serverFileRegex = expect.stringMatching(
    /file:.*\/.next(\/dev)?\/server\/.*\/vercel.HASH.png$/
  )
  const serverEdgeUrl = isTurbopack
    ? `blob:server/edge/assets/vercel.HASH.png`
    : `blob:vercel.HASH.png`

  let clientUrl: string
  const expectedPageContent = (count: number) =>
    'Hello ' + Array(count).fill(clientUrl).join('+')

  beforeAll(() => {
    let expectedToken
    if (isNextDev || !isTurbopack) {
      expectedToken = undefined
    } else {
      expectedToken = next.deploymentId
      if (!expectedToken) {
        throw new Error('Missing deployment id')
      }
    }
    clientUrl = `/_next/static/media/vercel.HASH.png${expectedToken ? `?dpl=${expectedToken}` : ''}`
  })

  it('should respond on middleware api', async () => {
    const data = await next
      .fetch('/middleware')
      .then((res) => res.ok && res.text())
    const json = JSON.parse(stripVercelPngHash(data))

    expect(json).toEqual({
      imported: clientUrl,
      url: serverEdgeUrl,
    })
  })

  describe('app router', () => {
    it('should respond on webmanifest', async () => {
      const data = await next
        .fetch('/manifest.webmanifest')
        .then((res) => res.ok && res.text())
      const json = JSON.parse(stripVercelPngHash(data))

      expect(json).toEqual({
        short_name: 'Next.js',
        name: 'Next.js',
        icons: [
          {
            src: clientUrl,
            type: 'image/png',
            sizes: '512x512',
          },
        ],
        // TODO Webpack bug?
        description: isTurbopack ? serverFileRegex : clientUrl,
      })
    })

    it('should respond on opengraph-image', async () => {
      const data = await next
        .fetch('/opengraph-image')
        .then((res) => res.ok && res.text())
      const json = JSON.parse(stripVercelPngHash(data))

      expect(json).toEqual({
        imported: clientUrl,
        // TODO Webpack bug?
        url: isTurbopack ? serverFileRegex : clientUrl,
      })
    })

    for (const page of ['/rsc', '/rsc-edge', '/client', '/client-edge']) {
      // TODO Webpack bug?
      let shouldSkip = isTurbopack ? false : page.includes('edge')

      ;(shouldSkip ? it.skip : it)(
        `should render the ${page} page`,
        async () => {
          const $ = await next.render$(page)
          // eslint-disable-next-line jest/no-standalone-expect
          expect(stripVercelPngHash($('main').text())).toEqual(
            expectedPageContent(2)
          )
        }
      )
      ;(shouldSkip ? it.skip : it)(
        `should client-render the ${page} page`,
        async () => {
          const browser = await next.browser(page)
          await retry(async () =>
            expect(
              stripVercelPngHash(await browser.elementByCss('main').text())
            ).toEqual(expectedPageContent(2))
          )
        }
      )
    }

    it('should respond on API', async () => {
      const data = await next.fetch('/api').then((res) => res.ok && res.text())
      const json = JSON.parse(stripVercelPngHash(data))

      expect(json).toEqual({
        imported: clientUrl,
        // TODO Webpack bug?
        url: isTurbopack ? serverFileRegex : clientUrl,
        size: isTurbopack ? 30079 : expect.toBeString(),
      })
    })
  })

  describe('pages router', () => {
    for (const [page, count] of [
      ['/pages/static', 2],
      ['/pages/ssr', 3],
      ['/pages/ssg', 3],
      ['/pages-edge/static', 2],
      ['/pages-edge/ssr', 3],
    ] as const) {
      // TODO Webpack bug?
      let shouldSkip = isTurbopack ? false : page.includes('edge')

      ;(shouldSkip ? it.skip : it)(
        `should render the ${page} page`,
        async () => {
          const $ = await next.render$(page)
          // eslint-disable-next-line jest/no-standalone-expect
          expect(stripVercelPngHash($('main').text())).toEqual(
            expectedPageContent(count)
          )
        }
      )
      ;(shouldSkip ? it.skip : it)(
        `should client-render the ${page} page`,
        async () => {
          const browser = await next.browser(page)
          await retry(async () =>
            expect(
              stripVercelPngHash(await browser.elementByCss('main').text())
            ).toEqual(expectedPageContent(count))
          )
        }
      )
    }

    it('should respond on API', async () => {
      const data = await next
        .fetch('/api/pages/')
        .then((res) => res.ok && res.text())
      const json = JSON.parse(stripVercelPngHash(data))

      expect(json).toEqual({
        imported: clientUrl,
        url: serverFileRegex,
        size: 30079,
      })
    })

    it('should respond on edge API', async () => {
      const data = await next
        .fetch('/api/pages-edge/')
        .then((res) => res.ok && res.text())
      const json = JSON.parse(stripVercelPngHash(data))

      expect(json).toEqual({
        imported: clientUrl,
        url: serverEdgeUrl,
      })
    })
  })
})

function stripVercelPngHash(text: string) {
  return text.replace(/vercel\.[0-9a-f]{8,}\.png/g, 'vercel.HASH.png')
}
