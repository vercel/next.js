/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { check, findPort, nextBuild, stopApp } from 'next-test-utils'
import { createServer } from '../serve-404'

const appDir = join(__dirname, '..')
const distDir = join(appDir, '.next')
const exportDir = join(appDir, 'out')

describe('app dir - with output export - client dynamic route', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      let app: any
      let port: number

      beforeAll(async () => {
        await fs.remove(distDir)
        await fs.remove(exportDir)

        // Build the app
        const result = await nextBuild(appDir, [], { stdout: true, stderr: true })
        expect(result.code).toBe(0)

        // Start custom static server with 404 fallback
        port = await findPort()
        app = await createServer(exportDir, port)
      })

      afterAll(async () => {
        if (app) {
          await stopApp(app)
        }
      })

      it('should successfully build with client dynamic route', async () => {
        // Verify the build succeeded without errors
        expect(app).toBeDefined()
      })

      it('should generate shell files for client dynamic route', async () => {
        // Verify shell HTML and RSC payload were generated
        const shellHtmlPath = join(exportDir, 'client-dynamic/__shell__.html')
        const shellTxtPath = join(exportDir, 'client-dynamic/__shell__.txt')

        expect(await fs.pathExists(shellHtmlPath)).toBe(true)
        expect(await fs.pathExists(shellTxtPath)).toBe(true)

        // Verify shell HTML content includes __shell__ placeholder
        const shellHtml = await fs.readFile(shellHtmlPath, 'utf-8')
        expect(shellHtml).toContain('__shell__')
        expect(shellHtml).toContain('Post:')
      })

      it('should generate 404.html with param patching logic', async () => {
        const notFoundPath = join(exportDir, '404.html')
        expect(await fs.pathExists(notFoundPath)).toBe(true)

        const notFoundHtml = await fs.readFile(notFoundPath, 'utf-8')
        expect(notFoundHtml).toContain('_clientDynamicRoutesManifest.json')
        expect(notFoundHtml).toContain('__shell__')
      })

      it('should generate client dynamic routes manifest', async () => {
        const manifestPath = join(
          exportDir,
          '_next/static/test-build-id/_clientDynamicRoutesManifest.json'
        )
        expect(await fs.pathExists(manifestPath)).toBe(true)

        const manifest = await fs.readJSON(manifestPath)
        expect(manifest.version).toBe(1)
        expect(manifest.routes).toHaveLength(1)
        expect(manifest.routes[0].pattern).toBe('/client-dynamic/[slug]')
      })

      it('should render different content for different dynamic params via 404 fallback', async () => {
        // Access /client-dynamic/first - should show "First Post"
        const browser = await webdriver(port, '/client-dynamic/first')

        // Wait for the 404.html to load shell and patch params
        await check(
          () => browser.elementByCss('#slug').text(),
          /First Post/
        )

        const firstSlug = await browser.elementByCss('#slug').text()
        expect(firstSlug).toContain('First Post')

        const firstDesc = await browser.elementByCss('#description').text()
        expect(firstDesc).toContain('FIRST')

        await browser.close()
      })

      it('should render different content for second dynamic param', async () => {
        // Access /client-dynamic/second - should show "Second Post"
        const browser = await webdriver(port, '/client-dynamic/second')

        await check(
          () => browser.elementByCss('#slug').text(),
          /Second Post/
        )

        const secondSlug = await browser.elementByCss('#slug').text()
        expect(secondSlug).toContain('Second Post')

        const secondDesc = await browser.elementByCss('#description').text()
        expect(secondDesc).toContain('SECOND')

        await browser.close()
      })

      it('should support client-side navigation between dynamic routes', async () => {
        const browser = await webdriver(port, '/')

        // Click on first dynamic link
        await browser.elementByCss('[href="/client-dynamic/first"]').click()

        await check(
          () => browser.elementByCss('#slug').text(),
          /First Post/
        )

        // Navigate to second post
        await browser.elementByCss('[href="/client-dynamic/second"]').click()

        await check(
          () => browser.elementByCss('#slug').text(),
          /Second Post/
        )

        // Navigate back to first post
        await browser.elementByCss('[href="/client-dynamic/first"]').click()

        await check(
          () => browser.elementByCss('#slug').text(),
          /First Post/
        )

        await browser.close()
      })
    }
  )
})
