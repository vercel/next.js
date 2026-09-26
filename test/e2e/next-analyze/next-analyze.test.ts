import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

describe('next analyze', () => {
  if (!shouldUseTurbopack()) {
    // Test suites require at least one test
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    // Test suites require at least one test
    it('is skipped', () => {})
    return
  }

  it('runs successfully without errors', async () => {
    let serveProcess: ChildProcess | undefined
    let stdoutBuffer = ''
    let resolveUrl!: (url: string) => void
    let rejectUrl!: (err: Error) => void
    const urlPromise = new Promise<string>((resolve, reject) => {
      resolveUrl = resolve
      rejectUrl = reject
    })

    const timeout = setTimeout(() => {
      rejectUrl(new Error('Server did not start within timeout'))
    }, 30000)

    const exit = next
      .runCommand(['analyze', '--port', '0'], {
        onStdout(msg) {
          stdoutBuffer += msg
          const urlMatch = stdoutBuffer.match(/http:\/\/[^\s]+/)
          if (urlMatch) {
            resolveUrl(urlMatch[0])
          }
        },
        instance(p) {
          serveProcess = p
        },
      })
      .finally(() => {
        clearTimeout(timeout)
      })

    try {
      const url = await urlPromise
      const response = await fetch(url)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(
        '<title>Next.js Bundle Analyzer</title>'
      )
    } finally {
      serveProcess?.kill()
      await exit.catch(() => {})
    }
  })

  it('stores the snapshot name in live and historical metadata', async () => {
    const name = 'My snapshot'
    const { exitCode, stderr } = await next.runCommand([
      'analyze',
      '--output',
      '--snapshot-name',
      name,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).not.toContain('Error')

    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const metadata = JSON.parse(
      readFileSync(path.join(analyzeDir, 'data/metadata.json'), 'utf-8')
    )
    expect(metadata.snapshotName).toBe(name)
    expect(metadata).not.toHaveProperty('baselineName')

    const history = JSON.parse(
      readFileSync(path.join(analyzeDir, 'history/history.json'), 'utf-8')
    )
    expect(history.snapshots[0].snapshotName).toBe(name)
    expect(history.snapshots[0]).not.toHaveProperty('baselineName')
  })

  it('builds and analyzes the same production assets without publishing browser maps', async () => {
    const staticDir = path.join(next.testDir, '.next/static')
    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze/data')
    const build = await next.build()
    expect(build.exitCode).toBe(0)

    const assets = () =>
      readdirSync(staticDir, { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.(js|css)$/.test(file))
        .sort()
    const normalAssets = assets()
    expect(normalAssets.some((file) => file.endsWith('.js'))).toBe(true)
    expect(normalAssets.some((file) => file.endsWith('.css'))).toBe(true)
    const normalContents = normalAssets.map((file) =>
      readFileSync(path.join(staticDir, file))
    )

    const result = await next.build({ args: ['--analyze'] })
    expect(result.exitCode).toBe(0)
    expect(assets()).toEqual(normalAssets)
    for (const [index, file] of normalAssets.entries()) {
      const content = readFileSync(path.join(staticDir, file))
      expect(content).toEqual(normalContents[index])
      expect(content.toString()).not.toContain('sourceMappingURL=')
    }
    expect(
      readdirSync(staticDir, { recursive: true, encoding: 'utf8' }).some((f) =>
        f.endsWith('.map')
      )
    ).toBe(false)
    expect(
      existsSync(path.join(next.testDir, '.next/server/app/page.js'))
    ).toBe(true)
    expect(
      readFileSync(path.join(analyzeDir, 'analyze.data'), 'utf8')
    ).toContain('"path":"demo.tsx"')
    expect(existsSync(path.join(analyzeDir, 'modules.data'))).toBe(true)
  }, 180_000)

  it('preserves published maps when production browser maps are enabled', async () => {
    const configPath = path.join(next.testDir, 'next.config.js')
    const originalConfig = readFileSync(configPath, 'utf8')
    try {
      await next.patchFile(
        'next.config.js',
        `${originalConfig}\nmodule.exports.productionBrowserSourceMaps = true\n`
      )
      expect((await next.build()).exitCode).toBe(0)
      const staticDir = path.join(next.testDir, '.next/static')
      const files = () =>
        readdirSync(staticDir, { recursive: true, encoding: 'utf8' })
          .filter((file) => /\.(js|css)(\.map)?$/.test(file))
          .sort()
      const normalFiles = files()
      expect(normalFiles.some((file) => file.endsWith('.map'))).toBe(true)
      const normalContents = normalFiles.map((file) =>
        readFileSync(path.join(staticDir, file))
      )
      expect((await next.build({ args: ['--analyze'] })).exitCode).toBe(0)
      expect(files()).toEqual(normalFiles)
      for (const [index, file] of normalFiles.entries()) {
        expect(readFileSync(path.join(staticDir, file))).toEqual(
          normalContents[index]
        )
      }
    } finally {
      await next.patchFile('next.config.js', originalConfig)
    }
  }, 180_000)

  it('advertises --analyze while accepting the legacy build flag', async () => {
    const help = await next.runCommand(['build', '--help'])
    expect(help.exitCode).toBe(0)
    expect(help.stdout).toContain('--analyze')
    expect(help.stdout).not.toContain('--experimental-analyze')

    const result = await next.build({ args: ['--experimental-analyze'] })
    expect(result.exitCode).toBe(0)
    expect(
      existsSync(
        path.join(next.testDir, '.next/diagnostics/analyze/data/analyze.data')
      )
    ).toBe(true)
  }, 180_000)
  ;['-o', '--output'].forEach((flag) => {
    describe(`with ${flag} flag`, () => {
      it('writes output to .next/diagnostics/analyze path', async () => {
        const defaultOutputPath = path.join(
          next.testDir,
          '.next/diagnostics/analyze'
        )

        const { exitCode, stderr, stdout } = await next.runCommand([
          'analyze',
          flag,
        ])

        expect(exitCode).toBe(0)
        expect(stderr).not.toContain('Error')
        expect(stdout).toContain('.next/diagnostics/analyze')

        expect(existsSync(defaultOutputPath)).toBe(true)
        for (const file of [
          'index.html',
          'data/routes.json',
          'data/modules.data',
          'data/analyze.data',
        ]) {
          expect(existsSync(path.join(defaultOutputPath, file))).toBe(true)
        }

        const routesJson = readFileSync(
          path.join(defaultOutputPath, 'data', 'routes.json'),
          'utf-8'
        )
        const routes = JSON.parse(routesJson)
        expect(routes).toEqual(['/', '/_not-found'])
      })
    })
  })
})
