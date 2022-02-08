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
    await fs.remove(join(context.appDir, '.next'))
    await nextBuild(context.appDir)
    const functionsManifestPath = join(
      context.distDir,
      'server',
      'functions-manifest.json'
    )
    expect(fs.existsSync(functionsManifestPath)).toBe(false)
    await fs.remove(join(context.appDir, '.next'))
  })
  it('should contain rsc paths in functions manifest', async () => {
    await nextBuild(context.appDir, { env: { ENABLE_FILE_SYSTEM_API: '1' } })
    const functionsManifestPath = join(
      context.distDir,
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
