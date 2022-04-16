import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'
import fs from 'fs-extra'

export default async function runtime(context, { runtime, env }) {
  const distDir = join(context.appDir, '.next')

  if (runtime === 'edge') {
    it('should support per-page runtime configuration', async () => {
      const html1 = await renderViaHTTP(context.appPort, '/runtime')
      expect(html1).toContain('Runtime: Node.js')
      const html2 = await renderViaHTTP(context.appPort, '/runtime-rsc')
      expect(html2).toContain('Runtime: Node.js')
    })
  }
  if (runtime === 'edge' && env === 'prod') {
    it('should include entrypoints from both runtimes in pages manifest', async () => {
      const distServerDir = join(distDir, 'server')
      const pagesManifest = await fs.readJSON(
        join(distServerDir, 'pages-manifest.json')
      )

      for (const key of [
        // Defaults:
        '/_app',
        '/_error',
        '/_document',
        // Special:
        '/404',
        // API routes:
        '/api/ping',
        // Edge runtime pages:
        '/streaming',
        '/streaming-rsc',
        // Node runtime pages:
        '/runtime',
        '/runtime-rsc',
      ]) {
        expect(key in pagesManifest).toBeTruthy()
      }
    })
  }
}
