/* eslint-env jest */
/* global jasmine */
import { nextBuild, nextServer, startApp, stopApp } from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'
import fetch from 'node-fetch'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

let server
let scriptsUrls
let baseResponseSize

function getResponseSizes(resourceUrls) {
  return Promise.all(
    resourceUrls.map(async url => {
      const context = await fetch(url).then(res => res.text())
      return {
        url,
        bytes: context.length,
      }
    })
  )
}

function getResponseSizesKB(responseSizes) {
  const responseSizeBytes = responseSizes.reduce(
    (accumulator, responseSizeObj) => accumulator + responseSizeObj.bytes,
    0
  )
  return Math.ceil(responseSizeBytes / 1024)
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
      .map(path => `${baseUrl}${path}`)
  })

  afterAll(async () => {
    // Clean up
    await stopApp(server)
  })

  it('should not increase the overall response size of default build', async () => {
    const responseSizes = [
      baseResponseSize,
      ...(await getResponseSizes(
        scriptsUrls.filter(path => !path.endsWith('.module.js'))
      )),
    ]
    const responseSizeKilobytes = getResponseSizesKB(responseSizes)
    console.log(
      `Response Sizes for default:\n${responseSizes
        .map(obj => ` ${obj.url}: ${obj.bytes} (bytes)`)
        .join('\n')} \nOverall: ${responseSizeKilobytes} KB`
    )

    // These numbers are without gzip compression!
    const delta = responseSizeKilobytes - 234
    expect(delta).toBeLessThanOrEqual(0) // don't increase size
    expect(delta).toBeGreaterThanOrEqual(-1) // don't decrease size without updating target
  })

  it('should not increase the overall response size of modern build', async () => {
    const responseSizes = [
      baseResponseSize,
      ...(await getResponseSizes(
        scriptsUrls.filter(path => path.endsWith('.module.js'))
      )),
    ]
    const responseSizeKilobytes = getResponseSizesKB(responseSizes)
    console.log(
      `Response Sizes for modern:\n${responseSizes
        .map(obj => ` ${obj.url}: ${obj.bytes} (bytes)`)
        .join('\n')} \nOverall: ${responseSizeKilobytes} KB`
    )

    // These numbers are without gzip compression!
    const delta = responseSizeKilobytes - 203
    expect(delta).toBeLessThanOrEqual(0) // don't increase size
    expect(delta).toBeGreaterThanOrEqual(-1) // don't decrease size without updating target
  })
})
