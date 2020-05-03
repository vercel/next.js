/* eslint-env jest */
/* global jasmine */
import { promises } from 'fs'
import { join } from 'path'
import cheerio from 'cheerio'
import { nextBuild, nextExport } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export config#exportTrailingSlash set to false', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })
  })

  it('should export pages as [filename].html instead of [filename]/index.html', async () => {
    expect.assertions(6)

    await expect(promises.access(join(outdir, 'index.html'))).resolves.toBe(
      undefined
    )
    await expect(promises.access(join(outdir, 'about.html'))).resolves.toBe(
      undefined
    )
    await expect(promises.access(join(outdir, 'posts.html'))).resolves.toBe(
      undefined
    )
    await expect(
      promises.access(join(outdir, 'posts', 'single.html'))
    ).resolves.toBe(undefined)

    const html = await promises.readFile(join(outdir, 'index.html'))
    const $ = cheerio.load(html)
    expect($('p').text()).toBe('I am a home page')

    const htmlSingle = await promises.readFile(
      join(outdir, 'posts', 'single.html')
    )
    const $single = cheerio.load(htmlSingle)
    expect($single('p').text()).toBe('I am a single post')
  })
})
