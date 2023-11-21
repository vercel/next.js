/* eslint-env jest */

import fsp from 'fs/promises'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
  getPageFileFromPagesManifest,
  fetchViaHTTP,
} from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')
let app
let appPort
let buildId

function runTests(route, routePath) {
  it(`[${route}] should regenerate page when revalidate time exceeded`, async () => {
    const fileName = join(
      appDir,
      '.next',
      'server',
      getPageFileFromPagesManifest(appDir, routePath).replace('.js', '.html')
    )
    const initialHtmlFile = await fsp.readFile(fileName, 'utf8')

    await waitFor(1000) // Wait revalidate duration

    expect(await renderViaHTTP(appPort, route)).toBe(initialHtmlFile)

    await waitFor(500) // Wait for regeneration to occur

    const regeneratedFileHtml = await fsp.readFile(fileName, 'utf8')
    expect(regeneratedFileHtml).not.toBe(initialHtmlFile)
    expect(await renderViaHTTP(appPort, route)).toBe(regeneratedFileHtml)
  })

  it(`[${route}] should regenerate /_next/data when revalidate time exceeded`, async () => {
    const fileName = join(
      appDir,
      '.next',
      'server',
      getPageFileFromPagesManifest(appDir, routePath).replace('.js', '.json')
    )
    const route = join(`/_next/data/${buildId}`, `${routePath}.json`)
    const initialFileJson = await fsp.readFile(fileName, 'utf8')

    await waitFor(1000) // Wait revalidate duration

    expect(JSON.parse(await renderViaHTTP(appPort, route))).toEqual(
      JSON.parse(initialFileJson)
    )

    await waitFor(500) // Wait for regeneration to occur

    const regeneratedFileJson = await fsp.readFile(fileName, 'utf8')
    expect(regeneratedFileJson).not.toBe(initialFileJson)
    expect(JSON.parse(await renderViaHTTP(appPort, route))).toEqual(
      JSON.parse(regeneratedFileJson)
    )
  })
}

describe('SSG Prerender Revalidate', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      await nextBuild(appDir, [])
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {})
      buildId = await fsp.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))

    runTests('/', '/')
    runTests('/named', '/named')
    runTests('/nested', '/nested')
    runTests('/nested/named', '/nested/named')

    it('should return cache-control header on 304 status', async () => {
      const url = `http://localhost:${appPort}`
      const res1 = await fetchViaHTTP(url, '/static')
      const cacheControl200 = res1.headers.get('Cache-Control')
      const etag = res1.headers.get('ETag')

      const headers = { 'If-None-Match': etag }
      const res2 = await fetchViaHTTP(url, '/static', undefined, { headers })
      const cacheControl304 = res2.headers.get('Cache-Control')
      expect(cacheControl304).toEqual(cacheControl200)
    })
  })

  // Regression test for https://github.com/vercel/next.js/issues/24806
  describe('[regression] production mode and incremental cache size exceeded', () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
          await nextBuild(appDir, [])
          appPort = await findPort()
          app = await nextStart(appDir, appPort, {
            // The lowest size of the LRU cache that can be set is "1"
            // this will cause the cache size to always be exceeded
            env: { __NEXT_TEST_MAX_ISR_CACHE: 1 },
          })
          buildId = await fsp.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
        })
        afterAll(() => killApp(app))

        runTests('/', '/')
        runTests('/named', '/named')
        runTests('/nested', '/nested')
        runTests('/nested/named', '/nested/named')
      }
    )
  })
})
