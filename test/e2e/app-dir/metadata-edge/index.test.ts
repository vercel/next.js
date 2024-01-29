import { createNextDescribe } from 'e2e-utils'
import imageSize from 'image-size'

createNextDescribe(
  'app dir - Metadata API on the Edge runtime',
  {
    files: __dirname,
  },
  ({ next, isNextStart }) => {
    describe('OG image route', () => {
      if (isNextStart) {
        it('should not bundle `ImageResponse` into the page worker', async () => {
          const pageBundle = await next.readFile('.next/server/app/page.js')
          expect(pageBundle).not.toContain('ImageResponse')

          const sharedPageBundle = await next.readFile(
            '.next/server/app/another/page.js'
          )
          expect(sharedPageBundle).not.toContain('ImageResponse')
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
  }
)
