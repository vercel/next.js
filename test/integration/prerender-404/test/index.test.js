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
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
const _error = join(appDir, 'pages/_error.js')
let app
let appPort
let buildId
let distPagesDir

const table = [
  ['default _error page'],
  [
    'custom _error page',
    `
      const Error = ({ statusCode }) => {
        if (statusCode === 404) {
          return <p>custom 404</p>;
        }
        return null;
      };
      export default Error;
    `,
  ],
  [
    'custom _error with getInitialProps',
    `
      const Error = ({ message }) => {
        return <p>{message}</p>;
      };
      Error.getInitialProps = () => {
        return { message: 'custom props' }
      }
      export default Error;
    `,
    true,
  ],
]
const runTests = (errorPage, hasGetInitialProps) => {
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

    if (errorPage) {
      it('renders custom 404.html correctly', async () => {
        const html = await renderViaHTTP(appPort, '/unknown')
        expect(html).toMatch(/custom props/)
      })
    }
  } else {
    it('outputs 404.html correctly', async () => {
      await fs.access(join(distPagesDir, '/404.html'), fs.constants.F_OK)
    })

    if (errorPage) {
      it('renders custom 404.html correctly', async () => {
        const html = await renderViaHTTP(appPort, '/unknown')
        expect(html).toMatch(/custom 404/)
      })
    }
  }
}

describe('SPR 404.html Prerender', () => {
  describe('serverless mode', () => {
    describe.each(table)('%s', (s, errorPage, hasGetInitialProps) => {
      beforeAll(async () => {
        await fs.remove(_error)
        await fs.writeFile(
          nextConfig,
          `module.exports = { target: 'serverless' }`,
          'utf8'
        )
        if (errorPage) {
          await fs.writeFile(_error, errorPage, 'utf8')
        }
        distPagesDir = join(appDir, '.next/serverless/pages')
        if (hasGetInitialProps) {
          await fs.remove(join(distPagesDir, '/404.html'))
        }
        await nextBuild(appDir)
        appPort = await findPort()
        app = nextStart(appDir, appPort)
        buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
      })
      afterAll(() => killApp(app))

      runTests(errorPage, hasGetInitialProps)
    })
  })

  describe('production mode', () => {
    describe.each(table)('%s', (s, errorPage, hasGetInitialProps) => {
      beforeAll(async () => {
        await fs.remove(_error)
        await fs.remove(nextConfig)
        if (errorPage) {
          await fs.writeFile(_error, errorPage, 'utf8')
        }
        await nextBuild(appDir, [], { stdout: true })
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
        buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
        distPagesDir = join(appDir, '.next/server/static', buildId, 'pages')
      })
      afterAll(async () => {
        await killApp(app)
        await fs.remove(_error)
      })

      runTests(errorPage, hasGetInitialProps)
    })
  })
})
