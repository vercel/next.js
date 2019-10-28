/* global fixture, test */
import 'testcafe'

import { nextBuild, nextServer, startApp, stopApp } from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'
import fetch from 'node-fetch'

function getResponseSizes (resourceUrls) {
  return Promise.all(
    resourceUrls.map(async url => {
      const context = await fetch(url).then(res => res.text())
      return {
        url,
        bytes: context.length
      }
    })
  )
}

function getResponseSizesKB (responseSizes) {
  const responseSizeBytes = responseSizes.reduce(
    (accumulator, responseSizeObj) => accumulator + responseSizeObj.bytes,
    0
  )
  return Math.ceil(responseSizeBytes / 1024)
}

fixture('Production response size')
  .before(async ctx => {
    const dir = join(__dirname, '../')

    // Build next app
    await nextBuild(dir)

    // Start next app
    ctx.server = await startApp(
      nextServer({
        dir,
        dev: false,
        quiet: true
      })
    )

    // Get the html document
    let baseUrl = `http://localhost:${ctx.server.address().port}`
    const htmlResponse = await fetch(baseUrl)

    // Find all script urls
    const html = await htmlResponse.text()
    ctx.baseResponseSize = { url: baseUrl, bytes: html.length }
    const $ = cheerio.load(html)
    ctx.scriptsUrls = $('script[src]')
      .map((i, el) => $(el).attr('src'))
      .get()
      .map(path => `${baseUrl}${path}`)
  })
  .after(async ctx => {
    // Clean up
    await stopApp(ctx.server)
  })

test('should not increase the overall response size of default build', async t => {
  const responseSizes = [
    t.fixtureCtx.baseResponseSize,
    ...(await getResponseSizes(
      t.fixtureCtx.scriptsUrls.filter(path => !path.endsWith('.module.js'))
    ))
  ]
  const responseSizeKilobytes = getResponseSizesKB(responseSizes)
  console.log(
    `Response Sizes for default:\n${responseSizes
      .map(obj => ` ${obj.url}: ${obj.bytes} (bytes)`)
      .join('\n')} \nOverall: ${responseSizeKilobytes} KB`
  )

  // These numbers are without gzip compression!
  await t.expect(responseSizeKilobytes <= 221).ok() // Kilobytes
})

test('should not increase the overall response size of modern build', async t => {
  const responseSizes = [
    t.fixtureCtx.baseResponseSize,
    ...(await getResponseSizes(
      t.fixtureCtx.scriptsUrls.filter(path => path.endsWith('.module.js'))
    ))
  ]
  const responseSizeKilobytes = getResponseSizesKB(responseSizes)
  console.log(
    `Response Sizes for modern:\n${responseSizes
      .map(obj => ` ${obj.url}: ${obj.bytes} (bytes)`)
      .join('\n')} \nOverall: ${responseSizeKilobytes} KB`
  )

  // These numbers are without gzip compression!
  await t.expect(responseSizeKilobytes <= 199).ok() // Kilobytes
})
