/* eslint-env jest */
/* global jasmine */
import fs from 'fs'
import { join } from 'path'
import cheerio from 'cheerio'
import { promisify } from 'util'
import {
  nextBuild,
  nextExport
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const readFile = promisify(fs.readFile)
const access = promisify(fs.access)
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export with default map', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })
  })

  it('should export with folder that has dot in name', async () => {
    expect.assertions(1)
    await expect(access(join(outdir, 'v1.12/index.html'))).resolves.toBe(undefined)
  })

  it('should export an amp only page to clean path', async () => {
    expect.assertions(1)
    await expect(access(join(outdir, 'docs/index.html'))).resolves.toBe(undefined)
  })

  it('should export hybrid amp page correctly', async () => {
    expect.assertions(2)
    await expect(access(join(outdir, 'some/index.html'))).resolves.toBe(undefined)
    await expect(access(join(outdir, 'some.amp/index.html'))).resolves.toBe(undefined)
  })

  it('should export nested hybrid amp page correctly', async () => {
    expect.assertions(3)
    await expect(access(join(outdir, 'docs/index.html'))).resolves.toBe(undefined)
    await expect(access(join(outdir, 'docs.amp/index.html'))).resolves.toBe(undefined)

    const html = await readFile(join(outdir, 'docs/index.html'))
    const $ = cheerio.load(html)
    expect($('link[rel=amphtml]').attr('href')).toBe('/docs.amp')
  })

  it('should export nested hybrid amp page correctly with folder', async () => {
    expect.assertions(3)
    await expect(access(join(outdir, 'info/index.html'))).resolves.toBe(undefined)
    await expect(access(join(outdir, 'info.amp/index.html'))).resolves.toBe(undefined)

    const html = await readFile(join(outdir, 'info/index.html'))
    const $ = cheerio.load(html)
    expect($('link[rel=amphtml]').attr('href')).toBe('/info.amp')
  })
})
