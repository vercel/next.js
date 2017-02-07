/* global jasmine, describe, it, expect, beforeAll, afterAll */

import fetch from 'node-fetch'
import { join } from 'path'
import {
  nextServer,
  nextBuild,
  findPort,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let app
let appPort
jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000

describe('Production Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    await app.prepare()
    appPort = await findPort()
    await app.start(appPort)
  })
  afterAll(() => app.close())

  describe('With basic usage', () => {
    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })
  })

  describe('JSON pages', () => {
    describe('when asked for a gzipped page', () => {
      it('should serve the gzipped page', async () => {
        const url = `http://localhost:${appPort}/_next/${app.renderOpts.buildId}/pages`
        const res = await fetch(url, { compress: true })
        expect(res.headers.get('Content-Encoding')).toBe('gzip')

        const page = await res.json()
        expect(page.component).toBeDefined()
      })
    })

    describe('when asked for a normal page', () => {
      it('should serve the normal page', async () => {
        const url = `http://localhost:${appPort}/_next/${app.renderOpts.buildId}/pages`
        const res = await fetch(url, { compress: false })
        expect(res.headers.get('Content-Encoding')).toBeNull()

        const page = await res.json()
        expect(page.component).toBeDefined()
      })
    })

    describe('when asked for a page with an unknown encoding', () => {
      it('should serve the normal page', async () => {
        const url = `http://localhost:${appPort}/_next/${app.renderOpts.buildId}/pages`
        const res = await fetch(url, {
          compress: false,
          headers: {
            'Accept-Encoding': 'br'
          }
        })
        expect(res.headers.get('Content-Encoding')).toBeNull()

        const page = await res.json()
        expect(page.component).toBeDefined()
      })
    })
  })
})
