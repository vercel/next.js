/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

// test suite
import clientNavigation from './client-navigation'

const context = {}
const appDir = join(__dirname, '../')
jest.setTimeout(1000 * 60 * 5)

const runTests = () => {
  clientNavigation(context, (p, q) => renderViaHTTP(context.appPort, p, q))
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
    })
    afterAll(() => killApp(context.server))

    runTests()
  })
})
