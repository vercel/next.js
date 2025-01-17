/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')
const header = 'X-From-Middleware'

function runTest() {
  it('loads a middleware', async () => {
    const response = await fetchViaHTTP(appPort, '/post-1')
    expect(response.headers.has(header)).toBe(true)
  })
}

;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
  'development mode',
  () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTest()
  }
)

// TODO enable that once turbopack supports middleware in development mode
;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
  'production mode',
  () => {
    beforeAll(async () => {
      await nextBuild(appDir)

      const outdir = join(__dirname, '..', 'out')
      await fs.remove(outdir).catch(() => {})

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTest()
  }
)
