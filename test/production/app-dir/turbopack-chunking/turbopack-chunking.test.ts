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
      const distDir = join(next.testDir, '.next')
      const clientChunks = (await listClientChunks(distDir)).filter(
        (name) => name.includes('chunks') && name.endsWith('.js')
      )
      const serverChunks = (
        await recursiveReadDir(join(distDir, 'server', 'chunks'))
      ).filter((name) => name.endsWith('.js'))
      return { clientChunks, serverChunks }
    }

    // Lists the Node.js server JS chunks of the last build. The server size
    // thresholds don't apply to edge chunks.
    async function listServerChunks() {
      const serverDir = join(next.testDir, '.next', 'server')
      return (await recursiveReadDir(serverDir, { relativePathnames: false }))
        .map((f) => relative(serverDir, f).replace(/\\/g, '/'))
        .filter((name) => name.startsWith('chunks/') && name.endsWith('.js'))
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

    // Server-side equivalent of `mergeAll`.
    const serverMergeAll = {
      minServerChunkSize: 100_000_000,
      maxMergeServerChunkSize: 100_000_000,
    }

    type BuildOutput = Awaited<ReturnType<typeof buildWith>>
    let mergeAllOutput: BuildOutput
    let noMergeOutput: BuildOutput
    let mergeAllWithComponentChunksOutput: BuildOutput
    let mergeAllWithMaxChunkSizeOutput: BuildOutput
    let mergeAllWithMaxServerChunkSizeOutput: BuildOutput

    // Merge everything, but split client chunks bigger than a small maximum size again.
    const mergeAllWithMaxChunkSize = {
      ...mergeAll,
      maxChunkSize: 20_000,
    }

    // Merge everything, but split server chunks bigger than a small maximum size again.
    const mergeAllWithMaxServerChunkSize = {
      ...mergeAll,
      maxServerChunkSize: 20_000,
    }

    beforeAll(async () => {
      mergeAllOutput = await buildWith(mergeAll)
      noMergeOutput = await buildWith(noMerge)
      mergeAllWithComponentChunksOutput = await buildWith({
        ...mergeAll,
        generateComponentChunks: true,
        minComponentChunkSize: 0,
      })
      mergeAllWithMaxChunkSizeOutput = await buildWith(mergeAllWithMaxChunkSize)
      mergeAllWithMaxServerChunkSizeOutput = await buildWith(
        mergeAllWithMaxServerChunkSize
      )
    })

    it('changes the client chunk output based on the size thresholds', () => {
      // Disabling merging produces strictly more client chunks than merging
      // everything, proving the size thresholds are wired through.
      expect(noMergeOutput.clientChunks.length).toBeGreaterThan(
        mergeAllOutput.clientChunks.length
      )
    })

    describe('server size thresholds', () => {
      let serverMergeAllChunks: string[]

      beforeAll(async () => {
        await build(serverMergeAll)
        serverMergeAllChunks = await listServerChunks()
      })

      // Each comparison changes a single option relative to `serverMergeAll`,
      // so it proves that specific option reaches the Node.js server chunking
      // context.
      describe('minServerChunkSize', () => {
        let chunks: string[]

        beforeAll(async () => {
          // A minimum of `0` disables merging entirely.
          await build({ ...serverMergeAll, minServerChunkSize: 0 })
          chunks = await listServerChunks()
        })

        it('changes the Node.js server chunk output', () => {
          expect(chunks.length).toBeGreaterThan(serverMergeAllChunks.length)
        })
      })

      describe('maxMergeServerChunkSize', () => {
        let chunks: string[]

        beforeAll(async () => {
          // Every chunk is bigger than 1 byte, so none of them can be merged.
          await build({ ...serverMergeAll, maxMergeServerChunkSize: 1 })
          chunks = await listServerChunks()
        })

        it('changes the Node.js server chunk output', () => {
          expect(chunks.length).toBeGreaterThan(serverMergeAllChunks.length)
        })
      })
    })

    it('emits additional component chunks when generateComponentChunks is enabled', () => {
      // With the same merge settings, enabling component chunks emits extra
      // per-component chunks alongside the merged chunks.
      expect(
        mergeAllWithComponentChunksOutput.clientChunks.length
      ).toBeGreaterThan(mergeAllOutput.clientChunks.length)
    })

    it('splits client chunks bigger than maxChunkSize', () => {
      // With the same merge settings, a small maxChunkSize splits the big merged chunks into
      // more, smaller chunks.
      expect(
        mergeAllWithMaxChunkSizeOutput.clientChunks.length
      ).toBeGreaterThan(mergeAllOutput.clientChunks.length)
      // maxChunkSize only applies to client chunks.
      expect(mergeAllWithMaxChunkSizeOutput.serverChunks).toEqual(
        mergeAllOutput.serverChunks
      )
    })

    it('splits server chunks bigger than maxServerChunkSize', () => {
      expect(
        mergeAllWithMaxServerChunkSizeOutput.serverChunks.length
      ).toBeGreaterThan(mergeAllOutput.serverChunks.length)
      // maxServerChunkSize only applies to server chunks.
      expect(mergeAllWithMaxServerChunkSizeOutput.clientChunks).toEqual(
        mergeAllOutput.clientChunks
      )
    })

    it.each([
      ['custom chunking', mergeAll],
      ['maxChunkSize', mergeAllWithMaxChunkSize],
      ['maxServerChunkSize', mergeAllWithMaxServerChunkSize],
    ])('renders and navigates correctly with %s', async (_, chunking) => {
      await build({ ...chunking, ...serverMergeAll })
      await next.start()
      try {
        const browser = await next.browser('/')
        expect(await browser.elementByCss('#home').text()).toBe('home')
        await browser
          .elementByCss('a[href="/a"]')
          .click()
          .waitForElementByCss('#page-a')
        expect(await browser.elementByCss('#page-a').text()).toBe('page a')
      } finally {
        await next.stop()
      }
    })
  }
)
