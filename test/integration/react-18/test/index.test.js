/* eslint-env jest */

import { join } from 'path'

import { File, renderViaHTTP, runDevSuite, runProdSuite } from 'next-test-utils'
import concurrent from './concurrent'
import basics from './basics'
import strictMode from './strict-mode'

const appDir = join(__dirname, '../app')
const indexPage = new File(join(appDir, 'pages/index.js'))

describe('Basics', () => {
  runTests('default setting with react 18', basics)
})

function runTestsAgainstRuntime(runtime) {
  runTests(
    `Concurrent mode in the ${runtime} runtime`,
    (context, env) => {
      concurrent(context, (p, q) => renderViaHTTP(context.appPort, p, q))
      strictMode(context)

      it('should not have invalid config warning', async () => {
        await renderViaHTTP(context.appPort, '/')
        expect(context.stderr).not.toContain('not exist in this version')
      })
    },
    {
      beforeAll: (env) => {
        indexPage.replace(
          "// runtime: 'experimental-edge'",
          `runtime: '${runtime}'`
        )
      },
      afterAll: (env) => {
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
