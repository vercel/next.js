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

const appDir = join(__dirname, '..')
let app
let appPort
let buildId
let stderr

function runTests(route, routePath) {
  it(`[${route}] should not revalidate when set to false`, async () => {
    const fileName = join(
      appDir,
      '.next',
      'server',
      getPageFileFromPagesManifest(appDir, routePath)
    )
    const initialHtml = await renderViaHTTP(appPort, route)
    const initialFileHtml = await fs.readFile(fileName, 'utf8')

    let newHtml = await renderViaHTTP(appPort, route)
    expect(initialHtml).toBe(newHtml)
    expect(await fs.readFile(fileName, 'utf8')).toBe(initialFileHtml)

    await waitFor(500)

    newHtml = await renderViaHTTP(appPort, route)
    expect(initialHtml).toBe(newHtml)
    expect(await fs.readFile(fileName, 'utf8')).toBe(initialFileHtml)

    await waitFor(500)

    newHtml = await renderViaHTTP(appPort, route)
    expect(initialHtml).toBe(newHtml)
    expect(await fs.readFile(fileName, 'utf8')).toBe(initialFileHtml)

    expect(stderr).not.toContain('GSP was re-run')
  })

  it(`[${route}] should not revalidate /_next/data when set to false`, async () => {
    const fileName = join(
      appDir,
      '.next',
      'server',
      getPageFileFromPagesManifest(appDir, routePath)
    )
    const route = join(`/_next/data/${buildId}`, `${routePath}.json`)

    const initialData = JSON.parse(await renderViaHTTP(appPort, route))
    const initialFileJson = await fs.readFile(fileName, 'utf8')

    expect(JSON.parse(await renderViaHTTP(appPort, route))).toEqual(initialData)
    expect(await fs.readFile(fileName, 'utf8')).toBe(initialFileJson)
    await waitFor(500)

    expect(JSON.parse(await renderViaHTTP(appPort, route))).toEqual(initialData)
    expect(await fs.readFile(fileName, 'utf8')).toBe(initialFileJson)
    await waitFor(500)

    expect(JSON.parse(await renderViaHTTP(appPort, route))).toEqual(initialData)
    expect(await fs.readFile(fileName, 'utf8')).toBe(initialFileJson)

    expect(stderr).not.toContain('GSP was re-run')
  })
}

describe('SSG Prerender No Revalidate', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir, [])
      appPort = await findPort()
      stderr = ''
      app = await nextStart(appDir, appPort, {
        onStderr: (msg) => {
          stderr += msg
        },
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
