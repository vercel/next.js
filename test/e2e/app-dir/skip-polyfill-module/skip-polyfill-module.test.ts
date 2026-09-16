import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

// Polyfill elimination via NormalModuleReplacementPlugin is implemented in webpack config
// @force-gate webpack
describe('skip-polyfill-module: skip polyfill-module for modern browserslist', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    packageJson: {
      browserslist: ['chrome 130', 'firefox 130', 'safari 18'],
    },
  })

  it('should render page using native ECMAScript features without polyfills', async () => {
    const $ = await next.render$('/')
    expect($('#title').text()).toBe('Modern Browserslist Test')
    expect($('#item').text()).toBe('two')
    expect($('#has-own').text()).toBe('has-own-true')

    // Verify HTML does not include any polyfill script tags
    expect($('script[src*="polyfills"]').length).toBe(0)
  })

  if (isNextStart) {
    it('should omit polyfill files from build manifest and client bundles when targeting modern browsers', async () => {
      const buildManifest = JSON.parse(
        await next.readFile('.next/build-manifest.json')
      )
      // When all target browsers support modern APIs, polyfillFiles should be empty
      expect(buildManifest.polyfillFiles || []).toEqual([])

      // Verify that no client chunk contains @next/polyfill-module code (replaced by noop)
      const staticChunksDir = path.join(next.testDir, '.next/static/chunks')
      const chunkFiles = fs.readdirSync(staticChunksDir)

      let checkedChunksCount = 0
      for (const file of chunkFiles) {
        if (file.endsWith('.js')) {
          const content = fs.readFileSync(
            path.join(staticChunksDir, file),
            'utf8'
          )
          // None of the polyfilled signatures should exist in the client chunks
          expect(content).not.toContain('"canParse"in URL')
          expect(content).not.toContain('Array.prototype.at||')
          expect(content).not.toContain('Object.hasOwn||')
          expect(content).not.toContain('"trimStart"in String.prototype')
          checkedChunksCount++
        }
      }
      expect(checkedChunksCount).toBeGreaterThan(0)
    })

    it('should hydrate successfully in browser', async () => {
      const browser = await next.browser('/')
      const text = await browser.elementById('client-mounted').text()
      expect(text).toBe('client-hydrated')
    })
  }
})
