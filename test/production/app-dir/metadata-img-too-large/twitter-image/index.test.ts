import { nextTestSetup } from 'e2e-utils'
import { generatePNG } from '../generate-image'

describe('app-dir - metadata-img-too-large twitter-image', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const pngFile = generatePNG(5)

  it('should throw when twitter-image file size exceeds 5MB', async () => {
    await next.patchFile('app/twitter-image.png', pngFile as any)
    await next.build()

    const regex = isTurbopack
      ? // in Turbopack, the path is simplified as [project]/.... It's also thrown earlier, so the prefix is slightly different.
        /File size for Twitter image "\[project\]\/app\/twitter-image\.png" exceeds 5MB/
      : /Error: File size for Twitter image ".*\/app\/twitter-image\.png" exceeds 5MB/

    expect(next.cliOutput).toMatch(regex)
  })
})
