/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  nextServer,
  startApp,
  stopApp,
  nextBuild,
} from 'next-test-utils'
import cheerio from 'cheerio'

let appDir = join(__dirname, '..')
let server
let appPort

describe('@next/third-parties basic usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)

    const app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(async () => {
    await stopApp(server)
  })

  it('renders YoutubeEmbed', async () => {
    const html = await renderViaHTTP(appPort, '/page1')
    const $ = cheerio.load(html)

    const baseContainer = $('[data-ntpc="YoutubeEmbed"]')
    const youtubeContainer = $('lite-youtube')
    expect(baseContainer.length).toBe(1)
    expect(youtubeContainer.length).toBe(1)
  })

  it('renders GoogleMapsEmbed', async () => {
    const html = await renderViaHTTP(appPort, '/page2')
    const $ = cheerio.load(html)

    const baseContainer = $('[data-ntpc="GoogleMapsEmbed"]')
    const mapContainer = $(
      '[src="https://www.google.com/maps/embed/v1/place?key=XYZ&q=Brooklyn+Bridge,New+York,NY"]'
    )
    expect(baseContainer.length).toBe(1)
    expect(mapContainer.length).toBe(1)
  })
})
