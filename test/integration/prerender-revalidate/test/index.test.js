/* eslint-env jest */

import fs from 'fs-extra'
import { getRouteCacheKey } from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  retry,
  waitFor,
  fetchViaHTTP,
} from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')
let app
let appPort
let buildId

function getScopedFile(routePath, extension) {
  const cacheKey = getRouteCacheKey(routePath, {
    kind: RouteKind.PAGES,
    sourceRoute: routePath,
  })
  return join(appDir, '.next', 'server', `${cacheKey}${extension}`)
}

async function settleScopedResponse(fileName, requestPath, isJson = false) {
  const warmStartedAt = Date.now()
  await renderViaHTTP(appPort, requestPath)

  return retry(
    async () => {
      const response = await renderViaHTTP(appPort, requestPath)
      const file = await fs.readFile(fileName, 'utf8')
      const { mtimeMs } = await fs.stat(fileName)
      // A promoted build seed keeps its original age. Wait for any stale seed
      // regeneration to finish before using the scoped file as the baseline.
      expect(mtimeMs).toBeGreaterThanOrEqual(warmStartedAt)
      expect(file).not.toBe('')
      if (isJson) {
        expect(JSON.parse(response)).toEqual(JSON.parse(file))
      } else {
        expect(response).toBe(file)
      }
      return file
    },
    15000,
    500
  )
}

function runTests(route, routePath) {
  it(`[${route}] should regenerate page when revalidate time exceeded`, async () => {
    const fileName = getScopedFile(routePath, '.html')
    const initialHtmlFile = await settleScopedResponse(fileName, route)

    await waitFor(1000) // Wait revalidate duration

    expect(await renderViaHTTP(appPort, route)).toBe(initialHtmlFile)

    await waitFor(500) // Wait for regeneration to occur

    const regeneratedFileHtml = await fs.readFile(fileName, 'utf8')
    expect(regeneratedFileHtml).not.toBe(initialHtmlFile)
    expect(await renderViaHTTP(appPort, route)).toBe(regeneratedFileHtml)
  })

  it(`[${route}] should regenerate /_next/data when revalidate time exceeded`, async () => {
    const fileName = getScopedFile(routePath, '.json')
    const route = join(`/_next/data/${buildId}`, `${routePath}.json`)
    const initialFileJson = await settleScopedResponse(fileName, route, true)

    await waitFor(1000) // Wait revalidate duration

    expect(JSON.parse(await renderViaHTTP(appPort, route))).toEqual(
      JSON.parse(initialFileJson)
    )

    await waitFor(500) // Wait for regeneration to occur

    const regeneratedFileJson = await fs.readFile(fileName, 'utf8')
    expect(regeneratedFileJson).not.toBe(initialFileJson)
    expect(JSON.parse(await renderViaHTTP(appPort, route))).toEqual(
      JSON.parse(regeneratedFileJson)
    )
  })
}

describe('SSG Prerender Revalidate', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        await nextBuild(appDir, [])
        appPort = await findPort()
        app = await nextStart(appDir, appPort, {})
        buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
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
    }
  )

  // Regression test for https://github.com/vercel/next.js/issues/24806
  describe('[regression] production mode and incremental cache size exceeded', () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          await fs.remove(join(appDir, '.next'))
          await nextBuild(appDir, [])
          appPort = await findPort()
          app = await nextStart(appDir, appPort, {
            // The lowest size of the LRU cache that can be set is "1"
            // this will cause the cache size to always be exceeded
            env: { __NEXT_TEST_MAX_ISR_CACHE: 1 },
          })
          buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
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
