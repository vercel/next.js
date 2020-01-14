/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
const routesManifest = join(appDir, '.next/routes-manifest.json')
let appPort
let app

describe('404.js page handling', () => {
  describe('with config disabled', () => {
    beforeAll(async () => {
      await fs.remove(nextConfig)
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should not use 404.js for 404 page', async () => {
      const html = await renderViaHTTP(appPort, '/non-existent')
      expect(html).not.toContain('page not found')
      expect(html).toContain('An error 404 occurred')
    })

    it('should still render 404.js when visited directly', async () => {
      const html = await renderViaHTTP(appPort, '/404')
      expect(html).toContain('page not found')
    })

    it('should set static404 in routes-manifest correctly', async () => {
      const data = await fs.readJSON(routesManifest)
      expect(data.static404).toBe(false)
    })
  })

  describe('with config enabled', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { experimental: { pages404: true } }`
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfig)
    })

    it('should use 404.js for 404 page', async () => {
      const html = await renderViaHTTP(appPort, '/non-existent')
      expect(html).toContain('page not found')
      expect(html).not.toContain('An error occurred')
    })

    it('should still render 404.js when visited directly', async () => {
      const html = await renderViaHTTP(appPort, '/404')
      expect(html).toContain('page not found')
    })

    it('should set static404 in routes-manifest correctly', async () => {
      const data = await fs.readJSON(routesManifest)
      expect(data.static404).toBe(true)
    })
  })
})
