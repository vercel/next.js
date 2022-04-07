/* eslint-env jest */

import { join } from 'path'

import {
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  hasRedbox,
  getRedboxHeader,
} from 'next-test-utils'
import concurrent from './concurrent'
import basics from './basics'
import strictMode from './strict-mode'
import webdriver from 'next-webdriver'

// overrides react and react-dom to v18
const nodeArgs = []
const appDir = join(__dirname, '../app')
const nextConfig = new File(join(appDir, 'next.config.js'))
const invalidPage = new File(join(appDir, 'pages/invalid.js'))

describe('Basics', () => {
  runTests('default setting with react 18', (context, env) =>
    basics(context, env)
  )
})

// React 18 with Strict Mode enabled might cause double invocation of lifecycle methods.
describe('Strict mode - dev', () => {
  const context = { appDir }

  beforeAll(async () => {
    nextConfig.replace('// reactStrictMode: true,', 'reactStrictMode: true,')
    context.appPort = await findPort()
    context.server = await launchApp(context.appDir, context.appPort, {
      nodeArgs,
    })
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
    },
    {
      beforeAll: (env) => {
        if (env === 'dev') {
          invalidPage.write(`export const value = 1`)
        }
        nextConfig.replace("// runtime: 'edge'", `runtime: '${runtime}'`)
      },
      afterAll: (env) => {
        if (env === 'dev') {
          invalidPage.delete()
        }
        nextConfig.restore()
      },
    }
  )
}

function runTest(env, name, fn, options) {
  const context = { appDir }
  describe(`${name} (${env})`, () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.stderr = ''
      options?.beforeAll(env)
      if (env === 'dev') {
        context.server = await launchApp(context.appDir, context.appPort, {
          nodeArgs,
          onStderr(msg) {
            context.stderr += msg
          },
        })
      } else {
        await nextBuild(context.appDir, [], { nodeArgs })
        context.server = await nextStart(context.appDir, context.appPort, {
          nodeArgs,
          onStderr(msg) {
            context.stderr += msg
          },
        })
      }
    })
    afterAll(async () => {
      options?.afterAll(env)
      await killApp(context.server)
    })
    fn(context, env)
  })
}

runTestsAgainstRuntime('edge')
runTestsAgainstRuntime('nodejs')

function runTests(name, fn, options) {
  runTest('dev', name, fn, options)
  runTest('prod', name, fn, options)
}
