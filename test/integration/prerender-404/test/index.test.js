/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const fixturesDir = join(__dirname, '..', 'fixtures')
const table = [
  ['default _error page', 'default-error'],
  ['custom _error page', 'custom-error', true],
  ['custom _error with getInitialProps', 'with-getInitialProps', true, true],
]

describe('SPR 404.html Prerender', () => {
  describe.each(table)('%s', (s, dir, hasErrorPage, hasGetInitialProps) => {
    const appDir = join(fixturesDir, dir)
    const nextConfig = join(appDir, 'next.config.js')
    let distPagesDir
    let appPort
    let app
    let buildId

    const runTests = () => {
      if (hasGetInitialProps) {
        it('should not output 404.html', async () => {
          let exists = true
          await fs
            .access(join(distPagesDir, '/404.html'), fs.constants.F_OK)
            .catch(e => {
              if (e.code === 'ENOENT') exists = false
            })
          expect(exists).toBe(false)
        })

        if (hasErrorPage) {
          it('renders custom 404.html correctly', async () => {
            const html = await renderViaHTTP(appPort, '/unknown')
            expect(html).toMatch(/custom props/)
          })
        }
      } else {
        it('outputs 404.html correctly', async () => {
          await fs.access(join(distPagesDir, '/404.html'), fs.constants.F_OK)
        })

        if (hasErrorPage) {
          it('renders custom 404.html correctly', async () => {
            const html = await renderViaHTTP(appPort, '/unknown')
            expect(html).toMatch(/custom 404/)
          })
        }
      }
    }

    describe('serverless mode', () => {
      distPagesDir = join(appDir, '.next/serverless/pages')

      beforeAll(async () => {
        await fs.writeFile(
          nextConfig,
          `module.exports = { target: 'serverless' }`,
          'utf8'
        )
        await nextBuild(appDir)
        appPort = await findPort()
        app = nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    })

    describe('production mode', () => {
      beforeAll(async () => {
        await fs.remove(nextConfig)
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
        buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
        distPagesDir = join(appDir, '.next/server/static', buildId, 'pages')
      })
      afterAll(async () => killApp(app))

      runTests()
    })
  })
})
