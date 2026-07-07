import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import type { NextAdapter } from 'next'

import { FILES } from './files'

// Webpack itself isn't deterministic
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'adapter-content-hashes',
  () => {
    describe.each([
      { name: 'standard', files: FILES.standard },
      { name: 'cache components', files: FILES.cacheComponents },
    ])('for $name', ({ name, files }) => {
      const { next } = nextTestSetup({
        files,
        env: {
          NEXT_ADAPTER_PATH: path.join(__dirname, './my-adapter.mjs'),
        },
      })

      it('should emit server-side hashes to adapter', async () => {
        const {
          repoRoot,
          outputs,
        }: Parameters<NextAdapter['onBuildComplete']>[0] = await next.readJSON(
          'build-complete.json'
        )

        function validateOutput(output: {
          runtime?: 'edge' | 'nodejs'
          filePath: string
          assets?: Record<string, string>
          assetsHashes?: Record<string, string>
        }) {
          try {
            expect(output).toBeDefined()

            // TODO ideally we would also provide hashes for edge functions
            if (output.runtime === 'edge') return

            const { assets, assetsHashes, filePath } = output
            expect(assets).toBeObject()
            expect(assets).not.toBeEmpty()
            expect(assetsHashes).toBeObject()
            for (const file in assets) {
              expect(assetsHashes[file]).toBeString()
            }

            expect(filePath).toBeString()
            expect(assetsHashes[path.relative(repoRoot, filePath)]).toBeString()
          } catch (err) {
            console.error('Validation failed for output:', output)
            throw err
          }
        }

        outputs.pages.forEach(validateOutput)
        outputs.appPages.forEach(validateOutput)
        validateOutput(outputs.middleware)
        outputs.pagesApi.forEach(validateOutput)
        outputs.appRoutes.forEach(validateOutput)
      })
    })
  }
)
