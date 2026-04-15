import path from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { startCleanStaticServer, stopApp, renderViaHTTP } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('Export Dynamic Pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let server: any
  let port: number
  beforeAll(async () => {
    await next.build()

    const outdir = path.join(next.testDir, 'out')
    server = await startCleanStaticServer(outdir)
    port = server.address().port
  })

  afterAll(async () => {
    await stopApp(server)
  })

  it('should of exported with correct asPath', async () => {
    const html = await renderViaHTTP(port, '/regression/jeff-is-cool')
    const $ = cheerio.load(html)
    expect($('#asPath').text()).toBe('/regression/jeff-is-cool')
  })

  it('should hydrate with correct asPath', async () => {
    expect.assertions(1)
    const browser = await webdriver(port, '/regression/jeff-is-cool')
    try {
      expect(await browser.eval(`window.__AS_PATHS`)).toEqual([
        '/regression/jeff-is-cool',
      ])
    } finally {
      await browser.close()
    }
  })
})
