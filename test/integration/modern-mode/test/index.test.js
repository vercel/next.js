/* eslint-env jest */

import { join } from 'path'
import rimraf from 'rimraf'
import { promisify } from 'util'
import {
  renderViaHTTP,
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
} from 'next-test-utils'
import cheerio from 'cheerio'

jest.setTimeout(1000 * 60 * 5)

const rimrafPromise = promisify(rimraf)
let appDir = join(__dirname, '..')
let server
let appPort

// TODO: Make webpack 5 work with nest-esm-plugin
describe.skip('Modern Mode', () => {
  beforeAll(async () => {
    await runNextCommand(['build'], {
      cwd: appDir,
      stdout: true,
      stderr: true,
    })

    const app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true,
      experimental: {
        modern: true,
      },
    })

    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(async () => {
    stopApp(server)
    rimrafPromise(join(appDir, '.next'))
  })
  it('should generate client side modern and legacy build files', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)

    const moduleScripts = $('script[src][type=module]').toArray()
    const nomoduleScripts = $('script[src][nomodule]').toArray()

    const moduleIndex = moduleScripts.find((script) =>
      script.attribs.src.includes('pages/index')
    )

    expect(moduleIndex).toBeDefined()

    const nomoduleIndex = nomoduleScripts.find((script) =>
      script.attribs.src.includes('pages/index')
    )

    expect(nomoduleIndex).toBeDefined()
  })
})
