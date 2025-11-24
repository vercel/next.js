import { nextTestSetup } from 'e2e-utils'
import imageSize from 'image-size'
import path from 'path'

describe('app dir - Metadata API on the Edge runtime', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  describe('OG image route', () => {
    if (isNextStart) {
      it('should not bundle `ImageResponse` into the page worker', async () => {
        const middlewareManifest = JSON.parse(
          await next.readFile('.next/server/middleware-manifest.json')
        )

        const uniquePageFiles = [
          ...new Set<string>(middlewareManifest.functions['/page'].files),
        ]

        const pageFilesThatHaveImageResponse = uniquePageFiles.filter(
          (file) => {
            return next
              .readFileSync(path.join('.next', file))
              .includes('experimental_FigmaImageResponse')
          }
        )
        expect(pageFilesThatHaveImageResponse).not.toBeEmpty()

        const uniqueAnotherFiles = [
          ...new Set<string>(
            middlewareManifest.functions['/another/page'].files
          ),
        ]
        expect(uniqueAnotherFiles).not.toBeEmpty()

        const anotherFilesThatHaveImageResponse = uniqueAnotherFiles.filter(
          (file) => {
            return (
              next
                .readFileSync(path.join('.next', file))
                // This export is not used but it checks if the `@vercel/og` package is shared between the two routes.
                .includes('experimental_FigmaImageResponse')
            )
          }
        )

        // Grab the list of files that hold `ImageResponse`. Given the chunking should create the same file for both routes it should end up being the same object.
        // This test was added to ensure that we don't include `ImageResponse` in the individual page bundles: https://github.com/vercel/next.js/pull/51950.
        expect(pageFilesThatHaveImageResponse).toMatchObject(
          anotherFilesThatHaveImageResponse
        )
      })
    }
  })

  it('should render OpenGraph image meta tag correctly', async () => {
    const html$ = await next.render$('/')
    const ogUrl = new URL(html$('meta[property="og:image"]').attr('content'))
    const imageBuffer = await (await next.fetch(ogUrl.pathname)).buffer()

    const size = imageSize(imageBuffer)
    expect([size.width, size.height]).toEqual([1200, 630])
  })
})
