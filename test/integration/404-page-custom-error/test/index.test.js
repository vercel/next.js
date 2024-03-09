/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  renderViaHTTP,
  fetchViaHTTP,
  getPageFileFromPagesManifest,
} from 'next-test-utils'

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = (mode) => {
  const isDev = mode === 'dev'

  it('should respond to 404 correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/404')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('This page could not be found')
  })

  it('should render error correctly', async () => {
    const text = await renderViaHTTP(appPort, '/err')
    expect(text).toContain(isDev ? 'oops' : 'Internal Server Error')
  })

  it('should render index page normal', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('hello from index')
  })

  if (!isDev) {
    it('should set pages404 in routes-manifest correctly', async () => {
      const data = await fs.readJSON(join(appDir, '.next/routes-manifest.json'))
      expect(data.pages404).toBe(true)
    })

    it('should have output 404.html', async () => {
      const page = getPageFileFromPagesManifest(appDir, '/404')
      expect(page.endsWith('.html')).toBe(true)
    })
  }
}

describe('Default 404 Page with custom _error', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    afterAll(() => killApp(app))

    it('should build successfully', async () => {
      const { code } = await nextBuild(appDir, [], {
        stderr: true,
        stdout: true,
      })

      expect(code).toBe(0)

      appPort = await findPort()

      app = await nextStart(appDir, appPort)
    })

    runTests('server')
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('dev')
  })
})
