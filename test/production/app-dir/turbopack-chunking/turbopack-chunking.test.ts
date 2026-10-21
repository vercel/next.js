import { nextTestSetup } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join, relative } from 'path'

// `experimental.turbopackChunking` only affects Turbopack production builds, so
// this suite is Turbopack-only. Webpack uses a different chunker and ignores it.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'experimental.turbopackChunking',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    async function build(turbopackChunking: object | undefined) {
      const experimental = turbopackChunking ? { turbopackChunking } : {}
      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify({ experimental }, null, 2)}`
      )
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    }

    async function buildWith(turbopackChunking: object | undefined) {
      await build(turbopackChunking)
      const chunks = await listClientChunks(join(next.testDir, '.next'))
      return chunks.filter(
        (name) => name.includes('chunks') && name.endsWith('.js')
      )
    }

    // Lists the Node.js server and edge JS chunks of the last build.
    async function listServerChunks() {
      const serverDir = join(next.testDir, '.next', 'server')
      const files = (
        await recursiveReadDir(serverDir, { relativePathnames: false })
      )
        .map((f) => relative(serverDir, f).replace(/\\/g, '/'))
        .filter((name) => name.endsWith('.js'))
      return {
        node: files.filter((name) => name.startsWith('chunks/')),
        edge: files.filter((name) => name.startsWith('edge/chunks/')),
      }
    }

    // Force the chunker to merge as much as possible into as few chunks as
    // possible.
    const mergeAll = {
      minChunkSize: 100_000_000,
      maxMergeChunkSize: 100_000_000,
      maxChunkCountPerGroup: 1,
    }

    // Disable merging entirely, so every chunk group emits its own chunks.
    const noMerge = {
      minChunkSize: 0,
      maxChunkCountPerGroup: 0,
      maxMergeChunkSize: 0,
    }

    // Server-side (Node.js and edge) equivalent of `mergeAll`.
    const serverMergeAll = {
      minServerChunkSize: 100_000_000,
      maxMergeServerChunkSize: 100_000_000,
    }

    let mergeAllChunks: string[]
    let noMergeChunks: string[]
    let mergeAllWithComponentChunks: string[]

    beforeAll(async () => {
      mergeAllChunks = await buildWith(mergeAll)
      noMergeChunks = await buildWith(noMerge)
      mergeAllWithComponentChunks = await buildWith({
        ...mergeAll,
        generateComponentChunks: true,
        minComponentChunkSize: 0,
      })
    })

    it('changes the client chunk output based on the size thresholds', () => {
      // Disabling merging produces strictly more client chunks than merging
      // everything, proving the size thresholds are wired through.
      expect(noMergeChunks.length).toBeGreaterThan(mergeAllChunks.length)
    })

    describe('server size thresholds', () => {
      type ServerChunks = Awaited<ReturnType<typeof listServerChunks>>
      let serverMergeAllChunks: ServerChunks

      beforeAll(async () => {
        await build(serverMergeAll)
        serverMergeAllChunks = await listServerChunks()
      })

      // Each comparison changes a single option relative to `serverMergeAll`,
      // so it proves that specific option reaches both the Node.js server and
      // the edge chunking contexts.
      describe('minServerChunkSize', () => {
        let chunks: ServerChunks

        beforeAll(async () => {
          // A minimum of `0` disables merging entirely.
          await build({ ...serverMergeAll, minServerChunkSize: 0 })
          chunks = await listServerChunks()
        })

        it('changes the Node.js server chunk output', () => {
          expect(chunks.node.length).toBeGreaterThan(
            serverMergeAllChunks.node.length
          )
        })

        it('changes the edge chunk output', () => {
          expect(chunks.edge.length).toBeGreaterThan(
            serverMergeAllChunks.edge.length
          )
        })
      })

      describe('maxMergeServerChunkSize', () => {
        let chunks: ServerChunks

        beforeAll(async () => {
          // Every chunk is bigger than 1 byte, so none of them can be merged.
          await build({ ...serverMergeAll, maxMergeServerChunkSize: 1 })
          chunks = await listServerChunks()
        })

        it('changes the Node.js server chunk output', () => {
          expect(chunks.node.length).toBeGreaterThan(
            serverMergeAllChunks.node.length
          )
        })

        it('changes the edge chunk output', () => {
          expect(chunks.edge.length).toBeGreaterThan(
            serverMergeAllChunks.edge.length
          )
        })
      })
    })

    it('emits additional component chunks when generateComponentChunks is enabled', () => {
      // With the same merge settings, enabling component chunks emits extra
      // per-component chunks alongside the merged chunks.
      expect(mergeAllWithComponentChunks.length).toBeGreaterThan(
        mergeAllChunks.length
      )
    })

    it('renders and navigates correctly with custom chunking', async () => {
      await build({ ...mergeAll, ...serverMergeAll })
      await next.start()
      try {
        const browser = await next.browser('/')
        expect(await browser.elementByCss('#home').text()).toBe('home')
        await browser
          .elementByCss('a[href="/a"]')
          .click()
          .waitForElementByCss('#page-a')
        expect(await browser.elementByCss('#page-a').text()).toBe('page a')

        const edgeBrowser = await next.browser('/edge')
        expect(await edgeBrowser.elementByCss('#page-edge').text()).toBe(
          'page edge'
        )
      } finally {
        await next.stop()
      }
    })
  }
)
