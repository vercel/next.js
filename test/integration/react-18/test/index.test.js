/* eslint-env jest */

import { join } from 'path'

import {
  File,
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
  hasRedbox,
  getRedboxHeader,
  runDevSuite,
  runProdSuite,
} from 'next-test-utils'
import concurrent from './concurrent'
import basics from './basics'
import strictMode from './strict-mode'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../app')
const nextConfig = new File(join(appDir, 'next.config.js'))
const invalidPage = new File(join(appDir, 'pages/invalid.js'))
const indexPage = new File(join(appDir, 'pages/index.js'))

describe('Basics', () => {
  runTests('default setting with react 18', basics)
})

// React 18 with Strict Mode enabled might cause double invocation of lifecycle methods.
describe('Strict mode - dev', () => {
  const context = { appDir }

  beforeAll(async () => {
    nextConfig.replace('// reactStrictMode: true,', 'reactStrictMode: true,')
    context.appPort = await findPort()
    context.server = await launchApp(context.appDir, context.appPort)
  })

  afterAll(() => {
    nextConfig.restore()
    killApp(context.server)
  })

  strictMode(context)
})

function runTestsAgainstRuntime(runtime) {
  runTests(
    `Concurrent mode in the ${runtime} runtime`,
    (context, env) => {
      concurrent(context, (p, q) => renderViaHTTP(context.appPort, p, q))

      if (env === 'dev') {
        it('should recover after undefined exported as default', async () => {
          const browser = await webdriver(context.appPort, '/invalid')

          expect(await hasRedbox(browser)).toBe(true)
          expect(await getRedboxHeader(browser)).toMatch(
            `Error: The default export is not a React Component in page: "/invalid"`
          )
        })
      }

      it('should not have invalid config warning', async () => {
        await renderViaHTTP(context.appPort, '/')
        expect(context.stderr).not.toContain('not exist in this version')
      })
    },
    {
      beforeAll: (env) => {
        if (env === 'dev') {
          invalidPage.write(`export const value = 1`)
        }
        nextConfig.replace(
          "// runtime: 'experimental-edge'",
          `runtime: '${runtime}'`
        )
        indexPage.replace(
          "// runtime: 'experimental-edge'",
          `runtime: '${runtime}'`
        )
      },
      afterAll: (env) => {
        if (env === 'dev') {
          invalidPage.delete()
        }
        nextConfig.restore()
        indexPage.restore()
      },
    }
  )
}

runTestsAgainstRuntime('experimental-edge')
runTestsAgainstRuntime('nodejs')

function runTests(name, fn, opts) {
  const suiteOptions = { ...opts, runTests: fn }
  runDevSuite(name, appDir, suiteOptions)
  runProdSuite(name, appDir, suiteOptions)
}
