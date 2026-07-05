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

  let faviconMd5: string
  let opengraphImageMd5: string

  // Each `next.start()` performs a full production build, and a single test
  // case only gets a 60s budget, which two builds can exceed on slower CI
  // runners (most often while collecting build traces). The first build and
  // start (with the original metadata files) therefore runs in `beforeAll`,
  // which gets the longer setup-hook budget, leaving the test body responsible
  // for only the second build. Keeping the build out of the test body also
  // makes it idempotent, so a `jest.retryTimes` retry recomputes the new hashes
  // against a stable baseline.
  beforeAll(async () => {
    await next.start()

    const $ = await next.render$('/')
    const faviconUrl = $('link[rel="icon"]').attr('href')
    const faviconBody = await (await next.fetch(faviconUrl)).text()
    faviconMd5 = generateMD5(faviconBody)

    const opengraphImageUrl = $('meta[property="og:image"]').attr('href')
    const opengraphImageBody = await (
      await next.fetch(opengraphImageUrl)
    ).text()
    opengraphImageMd5 = generateMD5(opengraphImageBody)

    await next.stop()
  })

  it('should generate different content after replace the static metadata file', async () => {
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
