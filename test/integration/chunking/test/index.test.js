/* eslint-env jest */

import cheerio from 'cheerio'
import { readdir, readFile, unlink } from 'fs-extra'
import {
  nextBuild,
  killApp,
  nextStart,
  findPort,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let chunks
let stats
let appPort
let app
const existsChunkNamed = (name) => {
  return chunks.some((chunk) => new RegExp(name).test(chunk))
}

// Skipped as it uses webpack internals / stats.json.
;(process.env.TURBOPACK ? describe.skip : describe)('Chunking', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      try {
        // If a previous build has left chunks behind, delete them
        const oldChunks = await readdir(
          join(appDir, '.next', 'static', 'chunks')
        )
        await Promise.all(
          oldChunks.map((chunk) => {
            return unlink(join(appDir, '.next', 'static', 'chunks', chunk))
          })
        )
      } catch (e) {
        // Error here means old chunks don't exist, so we don't need to do anything
      }
      await nextBuild(appDir, [])

      stats = (await readFile(join(appDir, '.next', 'stats.json'), 'utf8'))
        // fixes backslashes in keyNames not being escaped on windows
        .replace(/"static\\(.*?":?)/g, (match) => match.replace(/\\/g, '\\\\'))

      stats = JSON.parse(stats)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      chunks = await readdir(join(appDir, '.next', 'static', 'chunks'))
    })

    afterAll(() => killApp(app))

    it('should use all url friendly names', () => {
      expect(chunks).toEqual(chunks.map((name) => encodeURIComponent(name)))
    })

    it('should create a framework chunk', () => {
      expect(existsChunkNamed('framework')).toBe(true)
    })

    it('should not create a commons chunk', () => {
      // This app has no dependency that is required by ALL pages, and should
      // therefore not have a commons chunk
      expect(existsChunkNamed('commons')).toBe(false)
    })

    it('should not create a lib chunk for react or react-dom', () => {
      // These large dependencies would become lib chunks, except that they
      // are preemptively moved into the framework chunk.
      expect(existsChunkNamed('react|react-dom')).toBe(false)
    })

    it('should not preload the build manifest', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      expect(
        [].slice
          .call($('link[rel="preload"][as="script"]'))
          .map((e) => e.attribs.href)
          .some((entry) => entry.includes('_buildManifest'))
      ).toBe(false)
    })

    it('should execute the build manifest', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      expect(
        Array.from($('script'))
          .map((e) => e.attribs.src)
          .some((entry) => entry && entry.includes('_buildManifest'))
      ).toBe(true)
    })

    it('should not include more than one instance of react-dom', async () => {
      const misplacedReactDom = stats.chunks.some((chunk) => {
        if (chunk.names.includes('framework')) {
          // disregard react-dom in framework--it's supposed to be there
          return false
        }
        return chunk.modules.some((module) => {
          return /react-dom/.test(module.name)
        })
      })
      expect(misplacedReactDom).toBe(false)
    })

    describe('Serving', () => {
      it('should hydrate with aggressive chunking', async () => {
        const browser = await webdriver(appPort, '/page2')
        const text = await browser.elementByCss('#padded-str').text()

        expect(text).toBe('__rad__')

        await browser.close()
      })

      it('should load chunks when navigating', async () => {
        const browser = await webdriver(appPort, '/page3')
        const text = await browser
          .elementByCss('#page2-link')
          .click()
          .waitForElementByCss('#padded-str')
          .elementByCss('#padded-str')
          .text()

        expect(text).toBe('__rad__')

        await browser.close()
      })
    })
  })
})
