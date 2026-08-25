import fs from 'fs-extra'
import { join } from 'path'
import { optimizeImage } from 'next/dist/server/image-optimizer'

describe('with latest sharp', () => {
  it('should block avif decoding below the optimizer bypass', async () => {
    const buffer = await fs.readFile(join(__dirname, 'app/public/test.avif'))

    await expect(
      optimizeImage({
        buffer,
        contentType: 'image/webp',
        quality: 75,
        width: 100,
      })
    ).rejects.toThrow()
  })
})
