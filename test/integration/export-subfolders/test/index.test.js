/* global fixture, test */
import 'testcafe'

import fs from 'fs'
import { join } from 'path'
import cheerio from 'cheerio'
import { promisify } from 'util'
import { nextBuild, nextExport } from 'next-test-utils'

const readFile = promisify(fs.readFile)
const access = promisify(fs.access)
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

fixture('Export config#exportTrailingSlash set to false').before(async () => {
  await nextBuild(appDir)
  await nextExport(appDir, { outdir })
})

test('should export pages as [filename].html instead of [filename]/index.html', async t => {
  await t.expect(await access(join(outdir, 'index.html'))).eql(undefined)
  await t.expect(await access(join(outdir, 'about.html'))).eql(undefined)
  await t.expect(await access(join(outdir, 'posts.html'))).eql(undefined)
  await t
    .expect(await access(join(outdir, 'posts', 'single.html')))
    .eql(undefined)

  const html = await readFile(join(outdir, 'index.html'))
  const $ = cheerio.load(html)
  await t.expect($('p').text()).eql('I am a home page')

  const htmlSingle = await readFile(join(outdir, 'posts', 'single.html'))
  const $single = cheerio.load(htmlSingle)
  await t.expect($single('p').text()).eql('I am a single post')
})
