/* eslint-env jest */

import fs from 'fs-extra'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
  getPageFileFromPagesManifest,
} from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')
let app
let appPort
let buildId

function runTests(route, routePath, serverless) {
  it(`[${route}] should regenerate page when revalidate time exceeded`, async () => {
    const fileName = join(
      appDir,
      '.next',
      'server',
      getPageFileFromPagesManifest(appDir, routePath).replace('.js', '.html')
    )
    const initialHtmlFile = await fs.readFile(fileName, 'utf8')

    await waitFor(1000) // Wait revalidate duration

    expect(await renderViaHTTP(appPort, route)).toBe(initialHtmlFile)

    await waitFor(500) // Wait for regeneration to occur

    const regeneratedFileHtml = await fs.readFile(fileName, 'utf8')
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
    const initialFileJson = await fs.readFile(fileName, 'utf8')

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
  describe('production mode', () => {
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
  })

  // Regression test for https://github.com/vercel/next.js/issues/24806
  describe('[regression] production mode and incremental cache size exceeded', () => {
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
  })
})
