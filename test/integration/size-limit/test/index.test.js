/* eslint-env jest */

import { nextBuild, nextServer, startApp, stopApp } from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'
import fetch from 'node-fetch'

jest.setTimeout(1000 * 60 * 2)

let server
let scriptsUrls
let baseResponseSize

function getResponseSizes(resourceUrls) {
  return Promise.all(
    resourceUrls.map(async (url) => {
      const context = await fetch(url).then((res) => res.text())
      return {
        url,
        bytes: context.length,
      }
    })
  )
}

function getResponseSizesBytes(responseSizes) {
  return responseSizes.reduce(
    (accumulator, responseSizeObj) => accumulator + responseSizeObj.bytes,
    0
  )
}

describe('Production response size', () => {
  beforeAll(async () => {
    const dir = join(__dirname, '../')

    // Build next app
    await nextBuild(dir)

    // Start next app
    server = await startApp(
      nextServer({
        dir,
        dev: false,
        quiet: true,
      })
    )

    // Get the html document
    let baseUrl = `http://localhost:${server.address().port}`
    const htmlResponse = await fetch(baseUrl)

    // Find all script urls
    const html = await htmlResponse.text()
    baseResponseSize = { url: baseUrl, bytes: html.length }
    const $ = cheerio.load(html)
    scriptsUrls = $('script[src]')
      .map((i, el) => $(el).attr('src'))
      .get()
      .map((path) => `${baseUrl}${path}`)
  })

  afterAll(async () => {
    // Clean up
    await stopApp(server)
  })

  it('should not increase the overall response size of default build', async () => {
    const responseSizes = [
      baseResponseSize,
      ...(await getResponseSizes(scriptsUrls)),
    ]
    const responseSizesBytes = getResponseSizesBytes(responseSizes)
    console.log(
      `Response Sizes for default:\n${responseSizes
        .map((obj) => ` ${obj.url}: ${obj.bytes} (bytes)`)
        .join('\n')} \nOverall: ${responseSizesBytes} KB`
    )

    // These numbers are without gzip compression!
    const delta = responseSizesBytes / 1024

    // Expected difference: < 0.5
    expect(delta).toBeCloseTo(281.4, 0)
  })
})
