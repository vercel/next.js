/* global jasmine, describe, expect, jest, beforeAll, afterAll, it */

import cheerio from 'cheerio'
import { join } from 'path'
import { renderViaHTTP, findPort, nextServer } from 'next-test-utils'

let appPort
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const loadJSONInPage = pageContent => {
  const page = cheerio.load(pageContent)
  return JSON.parse(page('#__next').text())
}

describe(`exportPathMap's query in dev mode`, () => {
  beforeAll(async () => {
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: true
    })
    appPort = await findPort()
    await app.start(appPort, 'localhost')

    // pre-build index page
    await Promise.all([renderViaHTTP(appPort, '/')])
  })
  afterAll(async () => app.close())

  it('should be present in ctx.query', async () => {
    const pageContent = await renderViaHTTP(appPort, '/')
    const json = loadJSONInPage(pageContent)
    expect(json).toEqual({ a: 'blue' })
  })

  it('should replace url query params in ctx.query when conflicting', async () => {
    const pageContent = await renderViaHTTP(appPort, '/?a=red')
    const json = loadJSONInPage(pageContent)
    expect(json).toEqual({ a: 'blue' })
  })

  it('should be merged with url query params in ctx.query', async () => {
    const pageContent = await renderViaHTTP(appPort, '/?b=green')
    const json = loadJSONInPage(pageContent)
    expect(json).toEqual({ a: 'blue', b: 'green' })
  })

  it('should warn the user when merged with url query params in ctx.query', async () => {
    // catch console.warn call
    global.console.warn = jest.fn()

    await renderViaHTTP(appPort, '/?b=green')
    expect(global.console.warn).toHaveBeenCalledWith(
      `Url defines a query parameter 'b' that is missing in exportPathMap`
    )
  })
})
