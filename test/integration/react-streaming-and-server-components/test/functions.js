/**
 * This test contains everything related to edge and lambda functions such as
 * functions-manifest.
 */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from './utils'

export default function (context) {
  it('should not generate functions manifest when filesystem API is not enabled', async () => {
    await nextBuild(appDir)
    const functionsManifestPath = join(
      distDir,
      'server',
      'functions-manifest.json'
    )
    await fs.remove(join(appDir, '.next'))
    expect(fs.existsSync(functionsManifestPath)).toBe(false)
  })
  it('should contain rsc paths in functions manifest', async () => {
    await nextBuild(appDir, { env: { ENABLE_FILE_SYSTEM_API: '1' } })
    const functionsManifestPath = join(
      distDir,
      'server',
      'functions-manifest.json'
    )
    const content = JSON.parse(fs.readFileSync(functionsManifestPath, 'utf8'))
    const { pages } = content
    const pageNames = Object.keys(pages)

    const paths = ['/', '/next-api/link', '/routes/[dynamic]']
    paths.forEach((path) => {
      const { runtime, files } = pages[path]
      expect(pageNames).toContain(path)
      // Runtime of page `/` is undefined since it's configured as nodejs.
      expect(runtime).toBe(path === '/' ? undefined : 'web')
      expect(files.every((f) => f.startsWith('server/'))).toBe(true)
    })

    expect(content.version).toBe(1)
  })
}
