import { nextTestSetup } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'
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
      const chunks = await listClientChunks(join(next.testDir, '.next'))
      return chunks.filter(
        (name) => name.includes('chunks') && name.endsWith('.js')
      )
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

    it('emits additional component chunks when generateComponentChunks is enabled', () => {
      // With the same merge settings, enabling component chunks emits extra
      // per-component chunks alongside the merged chunks.
      expect(mergeAllWithComponentChunks.length).toBeGreaterThan(
        mergeAllChunks.length
      )
    })

    it('renders and navigates correctly with custom chunking', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify(
          { experimental: { turbopackChunking: mergeAll } },
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
