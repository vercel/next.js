/* global fixture, test */
import { t } from 'testcafe'

import { join } from 'path'
import {
  nextBuild,
  findPort,
  waitFor,
  nextStart,
  killApp
} from 'next-test-utils'
import { readdir, readFile, unlink, access } from 'fs-extra'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')

const existsChunkNamed = name => {
  return t.fixtureCtx.chunks.some(chunk => new RegExp(name).test(chunk))
}

fixture('Chunking').before(async ctx => {
  try {
    // If a previous build has left chunks behind, delete them
    const oldChunks = await readdir(join(appDir, '.next', 'static', 'chunks'))
    await Promise.all(
      oldChunks.map(chunk => {
        return unlink(join(appDir, '.next', 'static', 'chunks', chunk))
      })
    )
  } catch (e) {
    // Error here means old chunks don't exist, so we don't need to do anything
  }
  const { stdout, stderr } = await nextBuild(appDir, [], {
    stdout: true,
    stderr: true
  })
  console.log(stdout)
  console.error(stderr)
  ctx.stats = (await readFile(join(appDir, '.next', 'stats.json'), 'utf8'))
    // fixes backslashes in keyNames not being escaped on windows
    .replace(/"static\\(.*?":)/g, '"static\\\\$1')
    .replace(/("static\\.*?)\\pages\\(.*?":)/g, '$1\\\\pages\\\\$2')

  ctx.stats = JSON.parse(ctx.stats)
  ctx.buildId = await readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
  ctx.chunks = await readdir(join(appDir, '.next', 'static', 'chunks'))
})

test('should use all url friendly names', async t => {
  await t
    .expect(t.fixtureCtx.chunks)
    .eql(t.fixtureCtx.chunks.map(name => encodeURIComponent(name)))
})

test('should create a framework chunk', async t => {
  await t.expect(existsChunkNamed('framework')).eql(true)
})

test('should not create a commons chunk', async t => {
  // This app has no dependency that is required by ALL pages, and should
  // therefore not have a commons chunk
  await t.expect(existsChunkNamed('commons')).eql(false)
})

test('should not create a lib chunk for react or react-dom', async t => {
  // These large dependencies would become lib chunks, except that they
  // are preemptively moved into the framework chunk.
  await t.expect(existsChunkNamed('react|react-dom')).eql(false)
})

test('should create a _buildManifest.js file', async t => {
  await t
    .expect(
      await access(
        join(
          appDir,
          '.next',
          'static',
          t.fixtureCtx.buildId,
          '_buildManifest.js'
        )
      )
    )
    .eql(undefined) /* fs.access callback returns undefined if file exists */
})

test('should not preload the build manifest', async t => {
  const indexPage = await readFile(
    join(
      appDir,
      '.next',
      'server',
      'static',
      t.fixtureCtx.buildId,
      'pages',
      'index.html'
    )
  )

  const $ = cheerio.load(indexPage)
  await t
    .expect(
      [].slice
        .call($('link[rel="preload"][as="script"]'))
        .map(e => e.attribs.href)
        .some(entry => entry.includes('_buildManifest'))
    )
    .eql(false)
})

test('should not include more than one instance of react-dom', async t => {
  const misplacedReactDom = t.fixtureCtx.stats.chunks.some(chunk => {
    if (chunk.names.includes('framework')) {
      // disregard react-dom in framework--it's supposed to be there
      return false
    }
    return chunk.modules.some(module => {
      return /react-dom/.test(module.name)
    })
  })
  await t.expect(misplacedReactDom).eql(false)
})

test('should hydrate with granularChunks config', async t => {
  const appPort = await findPort()
  const app = await nextStart(appDir, appPort)

  const browser = await webdriver(appPort, '/page2')
  await waitFor(1000)
  const text = await browser.elementByCss('#padded-str').text()

  await t.expect(text).eql('__rad__')

  await browser.close()

  await killApp(app)
})
