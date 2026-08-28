import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import type { NextAdapter } from 'next'
import { listClientChunks } from 'next-test-utils'

// Immutable static files are only supported with Turbopack anyway
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'output: export - immutable assets',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      // `next start` does not work with `output: 'export'`.
      skipStart: true,
      disableAutoSkewProtection: true,
    })

    it('emits immutable assets and reports their hashes', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      const files = await listClientChunks(join(next.testDir, 'out', '_next'))
      expect(files).toContainEqual(expect.stringContaining('static/immutable/'))
      expect(files).not.toContainEqual(
        expect.stringMatching(/^static\/chunks\//)
      )

      const html = await next.readFile('out/index.html')
      expect(html).toContain('/_next/static/immutable/')
      expect(html).not.toContain('?dpl=test-deployment-id')

      const hashes = await next.readJSON(
        join(next.distDir, 'immutable-static-hashes.json')
      )
      const staticFiles: Parameters<
        NextAdapter['onBuildComplete']
      >[0]['outputs']['staticFiles'] = await next.readJSON(
        'build-complete.json'
      )

      let immutableFileCount = 0
      for (const output of staticFiles) {
        const id = output.id
          .replace(/^[/\\]?_next[/\\]/, '')
          .replaceAll('\\', '/')
        expect(output.immutableHash).toBe(hashes[id])
        if (output.immutableHash) {
          immutableFileCount++
        }
      }
      expect(immutableFileCount).toBeGreaterThan(0)
    })
  }
)
