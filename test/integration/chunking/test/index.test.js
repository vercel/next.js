/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  nextBuild,
  findPort,
  waitFor,
  nextStart,
  killApp,
} from 'next-test-utils'
import { readdir, readFile, unlink, access } from 'fs-extra'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = join(__dirname, '../')

let buildId
let chunks
let stats

const existsChunkNamed = name => {
  return chunks.some(chunk => new RegExp(name).test(chunk))
}

describe('Chunking', () => {
  beforeAll(async () => {
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
      stderr: true,
    })
    console.log(stdout)
    console.error(stderr)
    stats = (await readFile(join(appDir, '.next', 'stats.json'), 'utf8'))
      // fixes backslashes in keyNames not being escaped on windows
      .replace(/"static\\(.*?":?)/g, match => match.replace(/\\/g, '\\\\'))

    stats = JSON.parse(stats)
    buildId = await readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    chunks = await readdir(join(appDir, '.next', 'static', 'chunks'))
  })

  it('should use all url friendly names', () => {
    expect(chunks).toEqual(chunks.map(name => encodeURIComponent(name)))
  })

  it('should create a framework chunk', () => {
    expect(existsChunkNamed('framework')).toBe(true)
  })

  it('should not create a commons chunk', () => {
    // This app has no dependency that is required by ALL pages, and should
    // therefore not have a commons chunk
    expect(existsChunkNamed('commons')).toBe(false)
  })

  it('should not create a lib chunk for react or react-dom', () => {
    // These large dependencies would become lib chunks, except that they
    // are preemptively moved into the framework chunk.
    expect(existsChunkNamed('react|react-dom')).toBe(false)
  })

  it('should create a _buildManifest.js file', async () => {
    expect(
      await access(
        join(appDir, '.next', 'static', buildId, '_buildManifest.js')
      )
    ).toBe(undefined) /* fs.access callback returns undefined if file exists */
  })

  it('should not preload the build manifest', async () => {
    const indexPage = await readFile(
      join(appDir, '.next', 'server', 'static', buildId, 'pages', 'index.html')
    )

    const $ = cheerio.load(indexPage)
    expect(
      [].slice
        .call($('link[rel="preload"][as="script"]'))
        .map(e => e.attribs.href)
        .some(entry => entry.includes('_buildManifest'))
    ).toBe(false)
  })

  it('should not include more than one instance of react-dom', async () => {
    const misplacedReactDom = stats.chunks.some(chunk => {
      if (chunk.names.includes('framework')) {
        // disregard react-dom in framework--it's supposed to be there
        return false
      }
      return chunk.modules.some(module => {
        return /react-dom/.test(module.name)
      })
    })
    expect(misplacedReactDom).toBe(false)
  })

  it('should hydrate with granularChunks config', async () => {
    const appPort = await findPort()
    const app = await nextStart(appDir, appPort)

    const browser = await webdriver(appPort, '/page2')
    await waitFor(1000)
    const text = await browser.elementByCss('#padded-str').text()

    expect(text).toBe('__rad__')

    await browser.close()

    await killApp(app)
  })
})
