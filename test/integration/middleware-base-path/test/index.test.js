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
  it('path without basePath does not go through middleware', async () => {
    const response = await fetchViaHTTP(appPort, '/post-1')
    expect(response.headers.has(header)).toBe(false)
  })

  it('root with basePath goes through middleware', async () => {
    const response = await fetchViaHTTP(appPort, '/base-path')
    expect(response.headers.has(header)).toBe(true)
  })

  it('non-root with basePath goes through middleware', async () => {
    const response = await fetchViaHTTP(appPort, '/base-path/post-1')
    expect(response.headers.has(header)).toBe(true)
  })

  it('non-root with assetPrefix goes through middleware', async () => {
    const response = await fetchViaHTTP(appPort, '/asset-prefix/bundle.js')
    expect(response.headers.has(header)).toBe(true)
  })

  it('static bundle with assetPrefix does not ho through middleware', async () => {
    const response = await fetchViaHTTP(
      appPort,
      '/asset-prefix/_next/static/bundle.js'
    )
    expect(response.headers.has(header)).toBe(false)
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
