import fs from 'fs'
import path from 'path'

import { nextTestSetup, isNextStart } from 'e2e-utils'

function findSidecars(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) {
    return []
  }
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...findSidecars(entryPath, extension))
    } else if (entry.name.endsWith(extension)) {
      out.push(entryPath)
    }
  }
  return out
}

if (!isNextStart) {
  it('is only relevant to next build output', () => {})
} else {
  describe('staticPrecompress with output: standalone', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      // `next start` refuses to run against `output: standalone`.
      skipDeployment: true,
    })

    it('builds with sidecars and a runnable standalone server', async () => {
      await next.build()

      // The build step emits the sidecars even for a standalone build.
      const buildSidecars = findSidecars(
        path.join(next.testDir, '.next', 'static'),
        '.js.br'
      )
      expect(buildSidecars.length).toBeGreaterThan(0)

      // `output: standalone` intentionally omits `/_next/static` (it is
      // served from a CDN or copied alongside the server by the deployer);
      // once placed, the standalone server resolves it with the same
      // `serveStaticPrecompressed` path covered by the main suite.
      expect(
        fs.existsSync(
          path.join(next.testDir, '.next', 'standalone', 'server.js')
        )
      ).toBe(true)
    })
  })
}
