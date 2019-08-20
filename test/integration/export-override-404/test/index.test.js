/* eslint-env jest */
/* global jasmine */
import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { nextBuild, nextExport } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const readFile = promisify(fs.readFile)
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
