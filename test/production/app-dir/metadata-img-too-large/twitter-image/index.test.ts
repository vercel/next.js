import { nextTestSetup } from 'e2e-utils'
import { generatePNG } from '../generate-image'

describe('metadata-img-too-large twitter-image', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const pngFile = generatePNG(6)

  it('should throw when twitter-image file size exceeds 5MB', async () => {
    await next.patchFile('app/twitter-image.png', pngFile as any)

    await next.build()
    const { cliOutput } = next
    expect(cliOutput).toMatch(
      /Error: File size for Twitter image ".*\/app\/twitter-image\.png" exceeds 5MB/
    )
  })
})
