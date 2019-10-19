/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import cheerio from 'cheerio'
import {
  renderViaHTTP,
  nextBuild,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '..')
let appPort
let app
let output

const handleOutput = msg => {
  output += msg
}

async function get$ (path, query) {
  const html = await renderViaHTTP(appPort, path, query)
  return cheerio.load(html)
}

describe('TypeScript with transpileOnly flag', () => {
  describe('default behavior', () => {
    beforeAll(async () => {
      output = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout: handleOutput,
        onStderr: handleOutput
      })
    })
    afterAll(() => killApp(app))

    it('should render the page despite type errors', async () => {
      const $ = await get$('/')
      expect($('body').text()).toMatch(/Index page/)
    })

    it('should not report type checking to stdout', async () => {
      expect(output).not.toContain('waiting for typecheck results...')
      expect(output).not.toContain("is not assignable to type 'boolean'")
    })
  })

  it('should compile the app despite type errors', async () => {
    const output = await nextBuild(appDir, [], { stdout: true })
    expect(output.stdout).toMatch(/Compiled successfully/)
  })
})
