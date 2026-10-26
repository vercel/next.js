import { nextTestSetup } from 'e2e-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join, relative } from 'path'

// Edge counterpart of `test/production/app-dir/turbopack-chunking`. It lives in
// its own fixture because `export const runtime = 'edge'` is not compatible
// with Cache Components, so this fixture always disables it.
//
// `experimental.turbopackChunking` only affects Turbopack production builds, so
// this suite is Turbopack-only.
// @force-gate turbopack
describe('experimental.turbopackChunking (edge)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function build(turbopackChunking: object) {
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify(
        {
          // `export const runtime = 'edge'` is not compatible with Cache
          // Components.
          cacheComponents: false,
          experimental: { turbopackChunking },
        },
        null,
        2
      )}`
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  }

  // Lists the edge JS chunks of the last build.
  async function listEdgeChunks() {
    const serverDir = join(next.testDir, '.next', 'server')
    return (await recursiveReadDir(serverDir, { relativePathnames: false }))
      .map((f) => relative(serverDir, f).replace(/\\/g, '/'))
      .filter((name) => name.startsWith('edge/chunks/') && name.endsWith('.js'))
  }

  // Force the server chunker to merge as much as possible.
  const serverMergeAll = {
    minServerChunkSize: 100_000_000,
    maxMergeServerChunkSize: 100_000_000,
  }

  let mergeAllChunks: string[]

  beforeAll(async () => {
    await build(serverMergeAll)
    mergeAllChunks = await listEdgeChunks()
  })

  // Runs first so it can start the `serverMergeAll` build from `beforeAll`
  // without rebuilding.
  it('renders edge pages with custom chunking', async () => {
    await next.start()
    try {
      const $ = await next.render$('/')
      expect($('#page-edge').text()).toBe('page edge')
      const browser = await next.browser('/other')
      expect(await browser.elementByCss('#page-other').text()).toBe(
        'page other'
      )
    } finally {
      await next.stop()
    }
  })

  // Each comparison changes a single option relative to `serverMergeAll`, so
  // it proves that specific option reaches the edge chunking context.
  it('changes the edge chunk output based on minServerChunkSize', async () => {
    // A minimum of `0` disables merging entirely.
    await build({ ...serverMergeAll, minServerChunkSize: 0 })
    expect((await listEdgeChunks()).length).toBeGreaterThan(
      mergeAllChunks.length
    )
  })

  it('changes the edge chunk output based on maxMergeServerChunkSize', async () => {
    // Every chunk is bigger than 1 byte, so none of them can be merged.
    await build({ ...serverMergeAll, maxMergeServerChunkSize: 1 })
    expect((await listEdgeChunks()).length).toBeGreaterThan(
      mergeAllChunks.length
    )
  })
})
