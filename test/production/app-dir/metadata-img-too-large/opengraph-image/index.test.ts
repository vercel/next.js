import { nextTestSetup } from 'e2e-utils'
import { generatePNG } from '../generate-image'

describe('app-dir - metadata-img-too-large opengraph-image', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const pngFile = generatePNG(8)

  it('should throw when opengraph-image file size exceeds 8MB', async () => {
    await next.patchFile('app/opengraph-image.png', pngFile as any)
    await next.build()

    const regex = isTurbopack
      ? // in Turbopack, the path is simplified as [project]/.... It's also thrown earlier, so the prefix is slightly different.
        /File size for Open Graph image "\[project\]\/app\/opengraph-image\.png" exceeds 8MB/
      : /Error: File size for Open Graph image ".*\/app\/opengraph-image\.png" exceeds 8MB/

    expect(next.cliOutput).toMatch(regex)
  })
})
