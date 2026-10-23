import { nextTestSetup } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join } from 'path'

// `experimental.turbopackChunking` only affects Turbopack production builds, so
// this suite is Turbopack-only. Webpack uses a different chunker and ignores it.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'experimental.turbopackChunking',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    async function buildWith(turbopackChunking: object | undefined) {
      const experimental = turbopackChunking ? { turbopackChunking } : {}
      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify({ experimental }, null, 2)}`
      )
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
      const distDir = join(next.testDir, '.next')
      const clientChunks = (await listClientChunks(distDir)).filter(
        (name) => name.includes('chunks') && name.endsWith('.js')
      )
      const serverChunks = (
        await recursiveReadDir(join(distDir, 'server', 'chunks'))
      ).filter((name) => name.endsWith('.js'))
      return { clientChunks, serverChunks }
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
      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify(
          { experimental: { turbopackChunking: chunking } },
          null,
          2
        )}`
      )
      await next.build()
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
