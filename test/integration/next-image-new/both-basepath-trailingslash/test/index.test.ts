/* eslint-env jest */

import {
  fetchViaHTTP,
  findPort,
  getDeploymentId,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = (mode: 'dev' | 'server') => {
  let dpl: string
  let assetDpl: string
  beforeAll(() => {
    dpl = getDeploymentId(appDir, mode === 'dev').getDeploymentIdQuery(true)
    assetDpl = getDeploymentId(appDir, mode === 'dev').getAssetQuery(true)
  })

  it('should correctly load image src from import', async () => {
    const browser = await webdriver(appPort, '/prefix/')
    const img = await browser.elementById('import-img')
    const src = await img.getAttribute('src')
    expect(stripTestHash(src)).toBe(
      `/prefix/_next/image/?url=%2Fprefix%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=75${assetDpl}`
    )
    const res = await fetchViaHTTP(appPort, src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })
  it('should correctly load image src from string', async () => {
    const browser = await webdriver(appPort, '/prefix/')
    const img = await browser.elementById('string-img')
    const src = await img.getAttribute('src')
    expect(src).toBe(
      `/prefix/_next/image/?url=%2Fprefix%2Ftest.jpg&w=640&q=75${dpl}`
    )
    const res = await fetchViaHTTP(appPort, src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })
}

describe('Image Component basePath + trailingSlash Tests', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests('dev')
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests('server')
    }
  )
})

function stripTestHash(text: string) {
  return text.replace(/test\.[0-9a-f]{8,}\.(png|jpe?g)/g, 'test.HASH.$1')
}
