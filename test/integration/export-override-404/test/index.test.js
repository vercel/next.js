/* global fixture, test */
import 'testcafe'

import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { nextBuild, nextExport } from 'next-test-utils'

const readFile = promisify(fs.readFile)
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

fixture('Export with a page named 404.js').before(async () => {
  await nextBuild(appDir)
  await nextExport(appDir, { outdir })
})

test('should export a custom 404.html instead of default 404.html', async t => {
  const html = await readFile(join(outdir, '404.html'), 'utf8')
  await t
    .expect(html)
    .match(/this is a 404 page override the default 404\.html/)
})
