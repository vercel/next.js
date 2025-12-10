/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { nextBuild, nextStart, findPort, killApp } from 'next-test-utils'

const appDir = join(__dirname, '..')

let appPort
let app

describe('React Profiling Mode', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      describe('without config enabled', () => {
        beforeAll(async () => {
          await nextBuild(appDir, [], {
            env: { TEST_REACT_PRODUCTION_PROFILING: 'false' },
          })
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
        })
        afterAll(async () => {
          await killApp(app)
        })

        it('should not have used the react-dom profiling bundle', async () => {
          const browser = await webdriver(appPort, '/')
          const results = await browser.eval('window.profileResults')

          expect(results).toBeFalsy()
        })
      })

      describe('with config enabled', () => {
        beforeAll(async () => {
          await nextBuild(appDir, ['--profile'], {
            env: { TEST_REACT_PRODUCTION_PROFILING: 'true' },
          })
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
        })
        afterAll(async () => {
          await killApp(app)
        })

        it('should have used the react-dom profiling bundle for pages', async () => {
          const browser = await webdriver(appPort, '/')
          const results = await browser.eval('window.profileResults')

          expect(results.length).toBe(1)
          expect(results[0] && results[0][0]).toBe('hello')
        })

        it('should have used the react-dom profiling bundle for client component', async () => {
          const browser = await webdriver(appPort, '/client')
          const results = await browser.eval('window.profileResults')

          expect(results.length).toBe(1)
          expect(results[0] && results[0][0]).toBe('hello-app-client')
        })

        it('should have used the react-dom profiling bundle for server component', async () => {
          // Can't test react Profiler API in server components but make sure rendering works
          const browser = await webdriver(appPort, '/server')

          expect(await browser.waitForElementByCss('p').text()).toBe(
            'hello app server'
          )
        })
      })
    }
  )
})
