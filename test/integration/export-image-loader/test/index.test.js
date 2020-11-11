/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { nextBuild, nextExport } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export with cloudinary loader next/image component', () => {
  it('should build successfully', async () => {
    await fs.remove(join(appDir, '.next'))
    const { code } = await nextBuild(appDir)
    if (code !== 0) throw new Error(`build failed with status ${code}`)
  })

  it('should export successfully', async () => {
    const { code } = await nextExport(appDir, { outdir })
    if (code !== 0) throw new Error(`export failed with status ${code}`)
  })

  it('should contain img element in html output', async () => {
    const html = await fs.readFile(join(outdir, 'index.html'))
    const $ = cheerio.load(html)
    expect($('img[alt="icon"]').attr('alt')).toBe('icon')
  })
})
