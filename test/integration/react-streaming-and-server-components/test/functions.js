/**
 * This test contains everything related to edge and lambda functions such as
 * functions-manifest.
 */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from './utils'

export default function (context) {
  it('should not generate functions manifest when filesystem API is not enabled', async () => {
    // Make sure there is no existing functions manifest (caused by failed tests etc).
    const distDir = join(context.appDir, '.next')
    await fs.remove(distDir)
    await nextBuild(context.appDir)
    const functionsManifestPath = join(
      distDir,
      'server',
      'functions-manifest.json'
    )
    expect(fs.existsSync(functionsManifestPath)).toBe(false)
    await fs.remove(join(context.appDir, '.next'))
  })

  it('should contain rsc paths in functions manifest', async () => {
    const distDir = join(context.appDir, '.next')
    await nextBuild(context.appDir, { env: { ENABLE_FILE_SYSTEM_API: '1' } })
    const functionsManifestPath = join(
      distDir,
      'server',
      'functions-manifest.json'
    )
    const content = JSON.parse(fs.readFileSync(functionsManifestPath, 'utf8'))
    const { pages } = content
    const pageNames = Object.keys(pages)

    const paths = [
      '/',
      '/next-api/link',
      '/routes/[dynamic]',
      // @TODO: Implement per-page runtime in functions-manifest.
      // '/runtime'
    ]

    paths.forEach((path) => {
      const { runtime, files } = pages[path]
      expect(pageNames).toContain(path)

      // Runtime of page `/runtime` is configured as `nodejs`.
      expect(runtime).toBe(path === '/runtime' ? 'nodejs' : 'web')
      expect(files.every((f) => f.startsWith('server/'))).toBe(true)
    })

    expect(content.version).toBe(1)
  })
}
