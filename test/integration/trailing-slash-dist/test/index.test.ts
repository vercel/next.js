/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  getPageFileFromBuildManifest,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const originalIsNextDev = global.isNextDev
let appPort
let app

const runTest = (mode = 'server') => {
  beforeAll(() => {
    global.isNextDev = mode === 'dev'
  })
  afterAll(() => {
    global.isNextDev = originalIsNextDev
  })
  it('supports trailing slash', async () => {
    // Make sure the page is built before getting the file
    await renderViaHTTP(appPort, '/')
    const file = getPageFileFromBuildManifest(appDir, '/')
    const res = await fetchViaHTTP(appPort, join('/_next', file))

    expect(res.status).toBe(200)
  })
}

describe('Trailing slash in distDir', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))
      runTest('dev')
    }
  )
})
