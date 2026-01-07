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
    await next.start()

    const $ = await next.render$('/')
    const faviconUrl = $('link[rel="icon"]').attr('href')
    const faviconBody = await (await next.fetch(faviconUrl)).text()
    const faviconMd5 = generateMD5(faviconBody)

    const opengraphImageUrl = $('meta[property="og:image"]').attr('href')
    const opengraphImageBody = await (
      await next.fetch(opengraphImageUrl)
    ).text()
    const opengraphImageMd5 = generateMD5(opengraphImageBody)

    await next.stop()

    // Update favicon and opengraph image
    const newFaviconContent = await next.readFileBuffer('app/favicon.new.ico')
    await next.remove('app/favicon.ico')
    await next.writeFileBuffer('app/favicon.ico', newFaviconContent)

    const newOpengraphImageContent = await next.readFileBuffer(
      'app/opengraph-image.new.png'
    )
    await next.remove('app/opengraph-image.png')
    await next.writeFileBuffer(
      'app/opengraph-image.png',
      newOpengraphImageContent
    )

    await next.start()

    const new$ = await next.render$('/')
    const newFaviconUrl = new$('link[rel="icon"]').attr('href')
    const newFaviconBody = await (await next.fetch(newFaviconUrl)).text()
    const newFaviconMd5 = generateMD5(newFaviconBody)

    const newOpengraphImageUrl = new$('meta[property="og:image"]').attr('href')
    const newOpengraphImageBody = await (
      await next.fetch(newOpengraphImageUrl)
    ).text()
    const newOpengraphImageMd5 = generateMD5(newOpengraphImageBody)

    await next.stop()

    expect(faviconMd5).not.toBe(newFaviconMd5)
    expect(opengraphImageMd5).not.toBe(newOpengraphImageMd5)
  })
})
