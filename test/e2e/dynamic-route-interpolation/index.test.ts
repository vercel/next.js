import { nextTestSetup } from 'e2e-utils'
const fs = require('fs')

describe('Dynamic Route Interpolation', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should work', async () => {
    const $ = await next.render$('/blog/a')
    expect($('#slug').text()).toBe('a')
  })

  it('should work with parameter itself', async () => {
    const $ = await next.render$('/blog/[slug]')
    expect($('#slug').text()).toBe('[slug]')
  })

  it('should work with brackets', async () => {
    const $ = await next.render$('/blog/[abc]')
    expect($('#slug').text()).toBe('[abc]')
  })

  it('should work with parameter itself in API routes', async () => {
    const text = await next.render('/api/dynamic/[slug]')
    expect(text).toBe('slug: [slug]')
  })

  it('should work with brackets in API routes', async () => {
    const text = await next.render('/api/dynamic/[abc]')
    expect(text).toBe('slug: [abc]')
  })

  it('should bust data cache', async () => {
    const browser = await next.browser('/blog/login')
    await browser.elementById('now').click() // fetch data once
    const text = await browser.elementById('now').text()
    await browser.elementById('now').click() // fetch data again
    await browser.waitForElementByCss(`#now:not(:text("${text}"))`)
    await browser.close()
  })

  it('should bust data cache with symbol', async () => {
    const browser = await next.browser('/blog/@login')
    await browser.elementById('now').click() // fetch data once
    const text = await browser.elementById('now').text()
    await browser.elementById('now').click() // fetch data again
    await browser.waitForElementByCss(`#now:not(:text("${text}"))`)
    await browser.close()
  })

  if (isNextStart) {
    it('should support both encoded and decoded nextjs reserved path convention characters in path', async () => {
      const $ = await next.render$('/blog/123')
      const scripts: string[] = []
      for (const script of $('script').toArray()) {
        if (script.attribs.src) {
          scripts.push(script.attribs.src)
        }
      }

      expect(scripts).not.toBeEmpty()

      for (const encodedPath of scripts) {
        // e.g. /_next/static/chunks/pages/blog/%5Bslug%5D-3d2fedc300f04305.js
        const { status: encodedPathReqStatus } = await next.fetch(encodedPath)

        // e.g. /_next/static/chunks/pages/blog/[slug]-3d2fedc300f04305.js
        const decodedPath = decodeURI(encodedPath)
        const { status: decodedPathReqStatus } = await next.fetch(decodedPath)

        expect({
          encodedPath,
          encodedStatus: encodedPathReqStatus,
          decodedPath,
          decodedStatus: decodedPathReqStatus,
        }).toMatchObject({
          encodedPath,
          decodedPath,
          encodedStatus: 200,
          decodedStatus: 200,
        })
      }
    })

    it('should support partially encoded paths', async () => {
      const modalChunk = await fs.promises.readdir(
        next.testDir +
          '/.next/static/chunks/app/@modal/(...)comments/[productId]'
      )

      // Piece the path to the chunk together but only encode the productId section of it
      const partiallyEncodedPath =
        '/_next/static/chunks/app/@modal/(...)comments/%5BproductId%5D/' +
        modalChunk

      const { status: partiallyEncodedPathReqStatus } =
        await next.fetch(partiallyEncodedPath)

      expect(partiallyEncodedPathReqStatus).toBe(200)
    })
  }
})
