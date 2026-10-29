import { nextTestSetup } from 'e2e-utils'
import { validateGraphDump } from '../../../lib/analyze-graph-schema'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// Compares local build artifacts and invokes the Turbopack-only analyzer CLI.
// @force-gate !deploy && turbopack
describe('next analyze source maps', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it.each(['default', 'none', 'partial', 'full'] as const)(
    'preserves emitted assets with %s source maps',
    async (sourceMaps) => {
      const originalConfig = await next.readFile('next.config.js')
      const readBuildAssets = () => {
        const buildDir = path.join(next.testDir, '.next')
        const assets: Record<string, string> = {}
        for (const dir of ['static', 'server']) {
          for (const file of readdirSync(path.join(buildDir, dir), {
            recursive: true,
          })) {
            const filename = file.toString().replace(/\\/g, '/')
            if (/\.(?:js|css)(?:\.map)?$/.test(filename)) {
              assets[`${dir}/${filename}`] = createHash('sha256')
                .update(readFileSync(path.join(buildDir, dir, filename)))
                .digest('hex')
            }
          }
        }
        return assets
      }
      try {
        await next.patchFile(
          'next.config.js',
          `module.exports = {
            generateBuildId: () => 'analyze-test-build',
            productionBrowserSourceMaps: false,
            turbopack: {
              rules: {
                '*.css': { loaders: ['./source-map-loader.js'] },
              },
            },
            experimental: {
              ${
                sourceMaps === 'default'
                  ? 'serverSourceMaps: true,'
                  : `turbopackSourceMaps: ${sourceMaps !== 'none'},
                     turbopackInputSourceMaps: ${sourceMaps === 'full'},`
              }
            },
          }`
        )
        const env = {
          NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString(
            'base64'
          ),
        }
        const normal = await next.runCommand(['build'], { env })
        expect(normal).toEqual(expect.objectContaining({ exitCode: 0 }))
        const normalAssets = readBuildAssets()
        expect(
          Object.keys(normalAssets).some((file) => file.endsWith('.css'))
        ).toBe(true)
        const analyzed = await next.runCommand(['build', '--analyze'], { env })
        expect(analyzed).toEqual(expect.objectContaining({ exitCode: 0 }))
        expect(readBuildAssets()).toEqual(normalAssets)

        const maps = Object.keys(normalAssets)
          .filter((file) => file.endsWith('.map'))
          .map((file) => next.readFile(`.next/${file}`))
        const mapContents = await Promise.all(maps)
        if (sourceMaps === 'default') {
          const browserAssets = Object.keys(normalAssets).filter((file) =>
            file.startsWith('static/')
          )
          expect(browserAssets.some((file) => file.endsWith('.map'))).toBe(
            false
          )
          for (const file of browserAssets) {
            expect(await next.readFile(`.next/${file}`)).not.toMatch(
              /(?:^|\n)\/\/# sourceMappingURL=|\/\*# sourceMappingURL=/
            )
          }
          expect(mapContents.join('\n')).toContain('original-lazy.ts')
        } else if (sourceMaps === 'none') {
          expect(mapContents).toEqual([])
          for (const file of Object.keys(normalAssets)) {
            expect(await next.readFile(`.next/${file}`)).not.toMatch(
              /(?:^|\n)\/\/# sourceMappingURL=|\/\*# sourceMappingURL=/
            )
          }
        } else {
          expect(mapContents.length).toBeGreaterThan(0)
          const originalSources = mapContents.join('\n')
          expect(originalSources.includes('app/merged-target.ts')).toBe(true)
          if (sourceMaps === 'full') {
            expect(originalSources.includes('original-lazy.ts')).toBe(true)
            expect(originalSources.includes('original-page.scss')).toBe(true)
          } else {
            expect(originalSources.includes('original-lazy.ts')).toBe(false)
            expect(originalSources.includes('original-page.scss')).toBe(false)
          }
        }
        const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
        expect(existsSync(path.join(analyzeDir, 'data/analyze.data'))).toBe(
          true
        )
        const replay = await next.runCommand(['analyze', 'export'])
        expect(replay).toMatchObject({ exitCode: 0 })
        validateGraphDump(replay.stdout)
        const parts = replay.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
          .filter((record) => record.type === 'part')
        expect(
          parts.some((part) => part.source_path.includes('app/lazy.ts'))
        ).toBe(true)
        expect(
          parts.some((part) => part.source_path.includes('app/page.css'))
        ).toBe(true)
        expect(
          parts.some((part) =>
            part.source_path.includes('app/merged-target.ts')
          )
        ).toBe(true)
        expect(
          parts.some((part) => /original-(?:lazy|page)/.test(part.source_path))
        ).toBe(false)
      } finally {
        await next.patchFile('next.config.js', originalConfig)
      }
    },
    240_000
  )
})
