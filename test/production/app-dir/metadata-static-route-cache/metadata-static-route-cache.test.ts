import { nextTestSetup } from 'e2e-utils'
import crypto from 'crypto'

function generateMD5(text: string) {
  const hash = crypto.createHash('md5')
  hash.update(text)
  return hash.digest('hex')
}

describe('app dir - metadata static routes cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should generate different content after replace the static metadata file', async () => {
    await next.build()

    const faviconBuildContent = await next.readFile(
      '.next/server/app/favicon.ico.body'
    )
    const opengrpahImageBuildContent = await next.readFile(
      '.next/server/app/opengraph-image.png.body'
    )

    const faviconMd5 = generateMD5(faviconBuildContent)
    const opengraphImageMd5 = generateMD5(opengrpahImageBuildContent)

    // Update favicon and opengraph image
    const newFaviconContent = await next.readFile('app/favicon.ico.new')
    await next.patchFile('app/favicon.ico', newFaviconContent)

    const newOpengraphImageContent = await next.readFile(
      'app/opengraph-image.png.new'
    )
    await next.patchFile('app/opengraph-image.png', newOpengraphImageContent)

    await next.build()
    const faviconBuildContentNew = await next.readFile(
      '.next/server/app/favicon.ico.body'
    )
    const opengrpahImageBuildContentNew = await next.readFile(
      '.next/server/app/opengraph-image.png.body'
    )

    const faviconMd5New = generateMD5(faviconBuildContentNew)
    const opengraphImageMd5New = generateMD5(opengrpahImageBuildContentNew)

    expect(faviconMd5).not.toBe(faviconMd5New)
    expect(opengraphImageMd5).not.toBe(opengraphImageMd5New)
  })
})
