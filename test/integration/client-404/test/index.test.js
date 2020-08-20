/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  getBuildManifest,
} from 'next-test-utils'
import fs from 'fs-extra'

// test suite
import clientNavigation from './client-navigation'

const context = {}
const appDir = join(__dirname, '../')
jest.setTimeout(1000 * 60 * 5)

const runTests = (isProd = false) => {
  clientNavigation(context, isProd)
}

describe('Client 404', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.server = await launchApp(appDir, context.appPort)

      // pre-build page at the start
      await renderViaHTTP(context.appPort, '/')
    })
    afterAll(() => killApp(context.server))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      context.appPort = await findPort()
      context.server = await nextStart(appDir, context.appPort)

      const manifest = await getBuildManifest(appDir)
      const files = manifest.pages['/missing'].filter((d) =>
        /static[\\/]chunks[\\/]pages/.test(d)
      )
      if (files.length < 1) {
        throw new Error('oops!')
      }
      await Promise.all(files.map((f) => fs.remove(join(appDir, '.next', f))))
    })
    afterAll(() => killApp(context.server))

    runTests(true)
  })
})
