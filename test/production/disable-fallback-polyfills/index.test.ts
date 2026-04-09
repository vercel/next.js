import { createNext } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'
import { statSync } from 'fs'
import { join } from 'path'

// TODO: Implement experimental.fallbackNodePolyfills
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Disable fallback polyfills',
  () => {
    let next: NextInstance

    async function getIndexPageSize() {
      // Read build manifest to get chunk files for the index page
      // this only works reliably for pages router and simple examples.
      const buildManifest = await next.readJSON('.next/build-manifest.json')

      // Get chunks for the '/' page
      const indexPageChunks = buildManifest.pages['/'] || []

      // Calculate total size of all chunks for the index page
      let totalSize = 0
      for (const chunkPath of indexPageChunks) {
        const fullChunkPath = join(next.testDir, '.next', chunkPath)
        try {
          const stats = statSync(fullChunkPath)
          totalSize += stats.size
        } catch (error) {
          console.warn(`Could not read chunk: ${chunkPath}`, error.message)
        }
      }

      // Convert to kB for easier comparison
      return totalSize / 1024
    }

    beforeAll(async () => {
      next = await createNext({
        files: {
          'pages/index.js': `
          import { useEffect } from 'react'
          import crypto from 'crypto'

          export default function Page() {
            useEffect(() => {
              crypto;
            }, [])
            return <p>hello world</p>
          } 
        `,
        },
        dependencies: {
          axios: '0.27.2',
        },
      })
      await next.stop()
    })
    afterAll(() => next.destroy())

    it('Fallback polyfills added by default', async () => {
      const indexPageSizeKB = await getIndexPageSize()
      console.log(
        `Index page size (with polyfills): ${indexPageSizeKB.toFixed(2)} kB`
      )
      expect(indexPageSizeKB).not.toBeLessThan(400)
    })

    it('Reduced bundle size when polyfills are disabled', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = {
        experimental: {
          fallbackNodePolyfills: false
        }
      }`
      )
      await next.start()
      await next.stop()

      const indexPageSizeKB = await getIndexPageSize()
      console.log(
        `Index page size (without polyfills): ${indexPageSizeKB.toFixed(2)} kB`
      )
      expect(indexPageSizeKB).toBeLessThan(400)
    })

    it('Pass build without error if non-polyfilled module is unreachable', async () => {
      // `axios` uses `Buffer`, but it should be unreachable in the browser.
      // https://github.com/axios/axios/blob/649d739288c8e2c55829ac60e2345a0f3439c730/lib/helpers/toFormData.js#L138
      await next.patchFile(
        'pages/index.js',
        `import axios from 'axios'
       import { useEffect } from 'react'

       export default function Home() {
         useEffect(() => {
           axios.get('/api')
         }, [])

         return "hello world"
       }`
      )

      await expect(next.start()).not.toReject()
    })
  }
)
