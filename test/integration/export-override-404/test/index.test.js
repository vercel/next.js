/* eslint-env jest */

import { promises } from 'fs'
import { join } from 'path'
import { nextBuild, nextExport } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)
const { readFile } = promises
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export with a page named 404.js', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })
  })

  it('should export a custom 404.html instead of default 404.html', async () => {
    const html = await readFile(join(outdir, '404.html'), 'utf8')
    expect(html).toMatch(/this is a 404 page override the default 404\.html/)
  })
})
