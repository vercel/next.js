import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import fs from 'fs-extra'
import { expandPackageTraces } from 'next/dist/build/webpack/plugins/next-trace-entrypoints-plugin'

describe('standalone mode - tracing-native-dlopen', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('expands package traces for @img/sharp-libvips native packages', async () => {
    const root = next.testDir
    const pkgDir = join(root, 'node_modules/@img/sharp-libvips-test')
    await fs.ensureDir(join(pkgDir, 'lib'))
    await fs.writeFile(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@img/sharp-libvips-test', version: '1.0.0' })
    )
    await fs.writeFile(join(pkgDir, 'index.js'), 'module.exports = {}')
    await fs.writeFile(
      join(pkgDir, 'lib/libvips-cpp.8.18.3.dylib'),
      'binary-data'
    )

    const fileList = new Set<string>([
      'node_modules/@img/sharp-libvips-test/index.js',
      'node_modules/@img/sharp-libvips-test/package.json',
    ])
    const parentReason = {
      type: ['dependency' as const],
      ignored: false,
      parents: new Set(['app/page.js']),
    }
    const reasons = new Map<string, any>([
      ['node_modules/@img/sharp-libvips-test/index.js', parentReason],
      ['node_modules/@img/sharp-libvips-test/package.json', parentReason],
    ])

    await expandPackageTraces(root, fileList, reasons)

    expect(
      fileList.has(
        'node_modules/@img/sharp-libvips-test/lib/libvips-cpp.8.18.3.dylib'
      )
    ).toBe(true)
    const dylibReason = reasons.get(
      'node_modules/@img/sharp-libvips-test/lib/libvips-cpp.8.18.3.dylib'
    )
    expect(dylibReason).toBeDefined()
    expect(dylibReason.parents).toEqual(new Set(['app/page.js']))
  })

  it('should build in standalone mode without errors', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const standaloneDir = join(next.testDir, '.next/standalone')
    expect(await fs.pathExists(standaloneDir)).toBe(true)
  })
})
