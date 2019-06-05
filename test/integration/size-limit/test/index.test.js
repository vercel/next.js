/* eslint-env jest */
/* global jasmine */
import { nextBuild, nextServer, startApp, stopApp } from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'
import fetch from 'node-fetch'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

let responseSizes

describe('Production response size', () => {
  beforeAll(async () => {
    const dir = join(__dirname, '../')

    // Build next app
    await nextBuild(dir)

    // Start next app
    const server = await startApp(
      nextServer({
        dir,
        dev: false,
        quiet: true
      })
    )

    // Get the html document
    const baseUrl = `http://localhost:${server.address().port}`
    const htmlResponse = await fetch(baseUrl)

    // Find all script urls
    const html = await htmlResponse.text()
    const $ = cheerio.load(html)
    const scriptsUrls = $('script[src]')
      .map((i, el) => $(el).attr('src'))
      .get()
      .map(path => `${baseUrl}${path}`)

    // Measure the html document and all scripts
    const resourceUrls = [baseUrl, ...scriptsUrls]

    // Fetch all resources and get their size (bytes)
    responseSizes = await Promise.all(
      resourceUrls.map(async url => {
        const context = await fetch(url).then(res => res.text())
        return {
          url,
          bytes: context.length
        }
      })
    )

    // Clean up
    await stopApp(server)
  })

  it('should not increase the overall response size', async () => {
    const responseSizeBytes = responseSizes.reduce(
      (accumulator, responseSizeObj) => accumulator + responseSizeObj.bytes,
      0
    )
    const responseSizeKilobytes = Math.ceil(responseSizeBytes / 1024)

    console.log(
      `Response Sizes:\n${responseSizes
        .map(obj => ` ${obj.url}: ${obj.bytes} (bytes)`)
        .join('\n')} \nOverall: ${responseSizeKilobytes} KB`
    )

    // These numbers are without gzip compression!
    expect(responseSizeKilobytes).toBeLessThanOrEqual(216) // Kilobytes
  })
})
