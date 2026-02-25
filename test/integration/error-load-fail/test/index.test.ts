/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  check,
  getClientBuildManifestLoaderChunkUrlPath,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let app

describe('Failing to load _error', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      afterAll(() => killApp(app))

      it('handles failing to load _error correctly', async () => {
        await nextBuild(appDir)
        const appPort = await findPort()
        app = await nextStart(appDir, appPort)

        let chunk = getClientBuildManifestLoaderChunkUrlPath(appDir, '/_error')

        const browser = await webdriver(appPort, '/', {
          beforePageLoad(page) {
            // Make _error route fail to load
            page.route('**/' + chunk, (route) => {
              route.abort('blockedbyclient')
            })
          },
        })

        await browser.eval(`window.beforeNavigate = true`)
        await browser.elementByCss('#to-broken').click()

        await check(async () => {
          return !(await browser.eval('window.beforeNavigate'))
            ? 'reloaded'
            : 'fail'
        }, /reloaded/)
      })
    }
  )
})
