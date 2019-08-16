/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import { readdir, readFile, unlink, access } from 'fs-extra'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = join(__dirname, '../')

let buildId
let chunks

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
    await nextBuild(appDir)
    buildId = await readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    chunks = await readdir(join(appDir, '.next', 'static', 'chunks'))
  })

  it('should create a framework chunk', () => {
    expect(existsChunkNamed('framework')).toBe(true)
  })

  it('should create a library chunk for lodash', () => {
    // This test app has an import on all of lodash in page2.js. Because it is
    // a large library, it should be chunked out into its own library chunk
    expect(existsChunkNamed('lodash')).toBe(true)
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
})
