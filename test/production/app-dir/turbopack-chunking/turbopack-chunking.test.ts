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
      const { exitCode, cliOutput } = await next.build()
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
      return { clientChunks, serverChunks, cliOutput }
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
    // possible. `maxChunkSize` is disabled, since it must be at least 3 times
    // `minChunkSize`.
    const mergeAll = {
      minChunkSize: 100_000_000,
      maxMergeChunkSize: 100_000_000,
      maxChunkCountPerGroup: 1,
      maxChunkSize: 0,
    }

    // Disable merging entirely, so every chunk group emits its own chunks.
    // `maxChunkSize` is disabled, since a maximum would also limit the unlimited
    // `maxMergeChunkSize`.
    const noMerge = {
      minChunkSize: 0,
      maxChunkCountPerGroup: 0,
      maxMergeChunkSize: 0,
      maxChunkSize: 0,
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

    // Merge as much as possible, but never into client chunks bigger than a small maximum size, and
    // split chunks bigger than that.
    const mergeAllWithMaxChunkSize = {
      ...mergeAll,
      minChunkSize: 5_000,
      maxMergeChunkSize: 20_000,
      maxChunkSize: 20_000,
    }

    // Merge everything, but split server chunks bigger than a small maximum size. Node.js server
    // chunks have a fixed `maxMergeChunkSize` of 100 KB, so a smaller maximum size would be adjusted.
    const mergeAllWithMaxServerChunkSize = {
      ...mergeAll,
      maxServerChunkSize: 100_000,
    }

    // Component chunks of merged chunks must still work when merging respects a maximum size.
    const mergeAllWithMaxChunkSizeAndComponentChunks = {
      ...mergeAllWithMaxChunkSize,
      generateComponentChunks: true,
      minComponentChunkSize: 0,
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
      // With smaller merge and size limits, Turbopack emits more, smaller client chunks.
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

    it('does not warn about consistent chunk size limits', () => {
      for (const output of [
        mergeAllOutput,
        noMergeOutput,
        mergeAllWithMaxChunkSizeOutput,
        mergeAllWithMaxServerChunkSizeOutput,
      ]) {
        expect(output.cliOutput).not.toContain('Inconsistent chunk size limits')
      }
    })

    it('warns about and adjusts inconsistent chunk size limits', async () => {
      // `maxChunkSize` is smaller than 3 times `minChunkSize` (10 KB), and smaller than
      // `maxMergeChunkSize`.
      const { cliOutput, clientChunks } = await buildWith({
        minChunkSize: 10_000,
        maxMergeChunkSize: 100_000,
        maxChunkSize: 20_000,
      })
      expect(cliOutput).toContain(
        'Inconsistent chunk size limits for client chunks were adjusted'
      )
      expect(cliOutput).toContain(
        '`experimental.turbopackChunking.maxChunkSize` (20000) was increased to 30000'
      )
      expect(cliOutput).toContain(
        '`experimental.turbopackChunking.maxMergeChunkSize` (100000) was decreased to 30000'
      )
      expect(clientChunks.length).toBeGreaterThan(0)
    })

    it('warns when an enabled maxChunkSize limits an unlimited maxMergeChunkSize', async () => {
      const { cliOutput } = await buildWith({
        minChunkSize: 0,
        maxChunkCountPerGroup: 0,
        maxMergeChunkSize: 0,
        maxChunkSize: 20_000,
      })
      expect(cliOutput).toContain(
        '`experimental.turbopackChunking.maxMergeChunkSize` (unlimited) was decreased to 20000'
      )
    })

    it.each([
      ['custom chunking', mergeAll],
      ['maxChunkSize', mergeAllWithMaxChunkSize],
      [
        'maxChunkSize and component chunks',
        mergeAllWithMaxChunkSizeAndComponentChunks,
      ],
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
