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

fixture('Export with default map').before(async () => {
  await nextBuild(appDir)
  await nextExport(appDir, { outdir })
})

test('should export with folder that has dot in name', async t => {
  await t.expect(await access(join(outdir, 'v1.12.html'))).eql(undefined)
})

test('should export an amp only page to clean path', async t => {
  await t.expect(await access(join(outdir, 'docs.html'))).eql(undefined)
})

test('should export hybrid amp page correctly', async t => {
  await t.expect(await access(join(outdir, 'some.html'))).eql(undefined)
  await t.expect(await access(join(outdir, 'some.amp.html'))).eql(undefined)
})

test('should export nested hybrid amp page correctly', async t => {
  await t.expect(await access(join(outdir, 'docs.html'))).eql(undefined)
  await t.expect(await access(join(outdir, 'docs.amp.html'))).eql(undefined)

  const html = await readFile(join(outdir, 'docs.html'))
  const $ = cheerio.load(html)
  await t.expect($('link[rel=amphtml]').attr('href')).eql('/docs.amp')
})

test('should export nested hybrid amp page correctly with folder', async t => {
  await t.expect(await access(join(outdir, 'info.html'))).eql(undefined)
  await t.expect(await access(join(outdir, 'info.amp.html'))).eql(undefined)

  const html = await readFile(join(outdir, 'info.html'))
  const $ = cheerio.load(html)
  await t.expect($('link[rel=amphtml]').attr('href')).eql('/info.amp')
})

test('should export hybrid index amp page correctly', async t => {
  await t.expect(await access(join(outdir, 'index.html'))).eql(undefined)
  await t.expect(await access(join(outdir, 'index.amp.html'))).eql(undefined)

  const html = await readFile(join(outdir, 'index.html'))
  const $ = cheerio.load(html)
  await t.expect($('link[rel=amphtml]').attr('href')).eql('/index.amp')
})
