import fs from 'fs-extra'
import { nextBuild, nextExport } from 'next-test-utils'
import { join } from 'path'
import {
  appDir,
  distDir,
  expectedFiles,
  exportDir,
  getFiles,
  nextConfig,
} from './utils'

describe('app dir with output export (next dev / next build)', () => {
  it('should throw when exportPathMap configured', async () => {
    nextConfig.replace(
      'trailingSlash: true,',
      `trailingSlash: true,
       exportPathMap: async function (map) {
        return map
      },`
    )
    await fs.remove(distDir)
    await fs.remove(exportDir)
    let result = { code: 0, stderr: '' }
    try {
      result = await nextBuild(appDir, [], { stderr: true })
    } finally {
      nextConfig.restore()
    }
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'The "exportPathMap" configuration cannot be used with the "app" directory. Please use generateStaticParams() instead.'
    )
  })
  it('should warn about "next export" is no longer needed with config', async () => {
    await fs.remove(distDir)
    await fs.remove(exportDir)
    await nextBuild(appDir)
    expect(await getFiles()).toEqual(expectedFiles)
    let stdout = ''
    let stderr = ''
    await nextExport(
      appDir,
      { outdir: exportDir },
      {
        onStdout(msg) {
          stdout += msg
        },
        onStderr(msg) {
          stderr += msg
        },
      }
    )
    expect(stderr).toContain(
      '- warn "next export" is no longer needed when "output: export" is configured in next.config.js'
    )
    expect(stdout).toContain('Export successful. Files written to')
    expect(await getFiles()).toEqual(expectedFiles)
  })
  it('should error when no config.output detected for next export', async () => {
    await fs.remove(distDir)
    await fs.remove(exportDir)
    nextConfig.replace(`output: 'export',`, '')
    try {
      await nextBuild(appDir)
      expect(await getFiles()).toEqual([])
      let stdout = ''
      let stderr = ''
      let error = undefined
      try {
        await nextExport(
          appDir,
          { outdir: exportDir },
          {
            onStdout(msg) {
              stdout += msg
            },
            onStderr(msg) {
              stderr += msg
            },
          }
        )
      } catch (e) {
        error = e
      }
      expect(error).toBeDefined()
      expect(stderr).toContain(
        '- error "next export" does not work with App Router. Please use "output: export" in next.config.js'
      )
      expect(stdout).not.toContain('Export successful. Files written to')
      expect(await getFiles()).toEqual([])
    } finally {
      nextConfig.restore()
      await fs.remove(distDir)
      await fs.remove(exportDir)
    }
  })
  it('should correctly emit exported assets to config.distDir', async () => {
    const outputDir = join(appDir, 'output')
    await fs.remove(distDir)
    await fs.remove(outputDir)
    nextConfig.replace(
      'trailingSlash: true,',
      `trailingSlash: true,
       distDir: 'output',`
    )
    try {
      await nextBuild(appDir)
      expect(await getFiles(outputDir)).toEqual(expectedFiles)
    } finally {
      nextConfig.restore()
      await fs.remove(distDir)
      await fs.remove(outputDir)
    }
  })
})
