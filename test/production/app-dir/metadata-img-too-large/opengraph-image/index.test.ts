import { nextTestSetup } from 'e2e-utils'
import { generatePNG } from '../generate-image'

describe('app-dir - metadata-img-too-large opengraph-image', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const pngFile = generatePNG(8)

  it('should throw when opengraph-image file size exceeds 8MB', async () => {
    await next.patchFile('app/opengraph-image.png', pngFile as any)

    await next.build()
    const { cliOutput } = next
    expect(cliOutput).toMatch(
      /Error: File size for Open Graph image ".*\/app\/opengraph-image\.png" exceeds 8MB/
    )
  })
})
