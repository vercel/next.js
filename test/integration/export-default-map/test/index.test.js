/* eslint-env jest */

import { promises } from 'fs'
import { join } from 'path'
import cheerio from 'cheerio'
import { nextBuild } from 'next-test-utils'

const { access, readFile } = promises
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export with default map', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
    })

    it('should export with folder that has dot in name', async () => {
      expect.assertions(1)
      await expect(access(join(outdir, 'v1.12.html'))).resolves.toBe(undefined)
    })

    it('should export an amp only page to clean path', async () => {
      expect.assertions(1)
      await expect(access(join(outdir, 'docs.html'))).resolves.toBe(undefined)
    })

    it('should export hybrid amp page correctly', async () => {
      expect.assertions(2)
      await expect(access(join(outdir, 'some.html'))).resolves.toBe(undefined)
      await expect(access(join(outdir, 'some.amp.html'))).resolves.toBe(
        undefined
      )
    })

    it('should export nested hybrid amp page correctly', async () => {
      expect.assertions(3)
      await expect(access(join(outdir, 'docs.html'))).resolves.toBe(undefined)
      await expect(access(join(outdir, 'docs.amp.html'))).resolves.toBe(
        undefined
      )

      const html = await readFile(join(outdir, 'docs.html'))
      const $ = cheerio.load(html)
      expect($('link[rel=amphtml]').attr('href')).toBe('/docs.amp')
    })

    it('should export nested hybrid amp page correctly with folder', async () => {
      expect.assertions(3)
      await expect(access(join(outdir, 'info.html'))).resolves.toBe(undefined)
      await expect(access(join(outdir, 'info.amp.html'))).resolves.toBe(
        undefined
      )

      const html = await readFile(join(outdir, 'info.html'))
      const $ = cheerio.load(html)
      expect($('link[rel=amphtml]').attr('href')).toBe('/info.amp')
    })

    it('should export hybrid index amp page correctly', async () => {
      expect.assertions(3)
      await expect(access(join(outdir, 'index.html'))).resolves.toBe(undefined)
      await expect(access(join(outdir, 'index.amp.html'))).resolves.toBe(
        undefined
      )

      const html = await readFile(join(outdir, 'index.html'))
      const $ = cheerio.load(html)
      expect($('link[rel=amphtml]').attr('href')).toBe('/index.amp')
    })
  })
})
