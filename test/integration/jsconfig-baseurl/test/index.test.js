/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  check,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

async function get$(path, query) {
  const html = await renderViaHTTP(appPort, path, query)
  return cheerio.load(html)
}

describe('TypeScript Features', () => {
  describe('default behavior', () => {
    let output = ''

    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout(msg) {
          output += msg || ''
        },
        onStderr(msg) {
          output += msg || ''
        },
      })
    })
    afterAll(() => killApp(app))

    it('should render the page', async () => {
      const $ = await get$('/hello')
      expect($('body').text()).toMatch(/World/)
    })

    it('should have correct module not found error', async () => {
      const basicPage = join(appDir, 'pages/hello.js')
      const contents = await fs.readFile(basicPage, 'utf8')

      await fs.writeFile(
        basicPage,
        contents.replace('components/world', 'components/worldd')
      )
      await renderViaHTTP(appPort, '/hello')

      const found = await check(
        () => stripAnsi(output),
        process.env.TURBOPACK
          ? /unable to resolve module "components\/worldd"/
          : /Module not found: Can't resolve 'components\/worldd'/,
        false
      )
      await fs.writeFile(basicPage, contents)
      expect(found).toBe(true)
    })
  })

  describe('should build', () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          await nextBuild(appDir)
        })
        it('should trace correctly', async () => {
          const helloTrace = await fs.readJSON(
            join(appDir, '.next/server/pages/hello.js.nft.json')
          )
          expect(
            helloTrace.files.some((file) =>
              file.includes('components/world.js')
            )
          ).toBe(false)
          expect(
            helloTrace.files.some((file) => file.includes('react/index.js'))
          ).toBe(true)
        })
      }
    )
  })
})
