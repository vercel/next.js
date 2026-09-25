import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

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
    env: {
      TURBO_ENGINE_IGNORE_DIRTY: '1',
      NEXT_TURBOPACK_TASK_STATISTICS: '.next/analyze-cache-stats.json',
    },
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
        expect(routes).toEqual(['/', '/_not-found', '/about', '/edge'])
      })
    })
  })

  it('reuses mapped build chunks and attributes client modules', async () => {
    const build = await next.build()
    expect(build.exitCode).toBe(0)
    const result = await next.runCommand(['analyze', '--output'])
    expect(result.exitCode).toBe(0)

    const stats = JSON.parse(
      readFileSync(
        path.join(next.testDir, '.next/analyze-cache-stats.json'),
        'utf8'
      )
    )
    for (const task of [
      'next_api::project::Project::whole_app_module_graphs',
      'turbopack_browser::ecmascript::content::EcmascriptBrowserChunkContent::code',
      'turbopack_nodejs::ecmascript::node::content::EcmascriptNodeChunkContent::code',
    ]) {
      expect(stats[task]?.cache_miss ?? 0).toBe(0)
    }

    const data = readFileSync(
      path.join(next.testDir, '.next/diagnostics/analyze/data/analyze.data')
    )
    const header = JSON.parse(
      data.subarray(4, 4 + data.readUInt32BE(0)).toString()
    )
    const fullPath = (index: number): string => {
      const source = header.sources[index]
      return source.parent_source_index === null
        ? source.path
        : fullPath(source.parent_source_index) + source.path
    }
    const sources = header.sources.map((_: unknown, index: number) =>
      fullPath(index)
    )
    expect(
      header.chunk_parts.some(
        (part: { source_index: number; size: number }) =>
          sources[part.source_index].endsWith(
            '/app/widget.tsx/__nextjs-internal-proxy.mjs'
          ) && part.size > 0
      )
    ).toBe(true)
    expect(
      header.chunk_parts.some(
        (part: {
          source_index: number
          output_file_index: number
          size: number
        }) =>
          sources[part.source_index].endsWith('/app/widget.css') &&
          header.output_files[part.output_file_index].filename.endsWith(
            '.css'
          ) &&
          part.size > 0
      )
    ).toBe(true)
    // Ensure mapped client JS remains attributed to source files, rather than
    // silently turning all client chunks into whole-file parts.
    expect(
      header.chunk_parts.some(
        (part: { source_index: number; output_file_index: number }) =>
          sources[part.source_index].startsWith('[project]/') &&
          header.output_files[part.output_file_index].filename.startsWith(
            '[client-fs]/'
          ) &&
          header.output_files[part.output_file_index].filename.endsWith('.js')
      )
    ).toBe(true)

    const appOnly = await next.runCommand([
      'analyze',
      '--experimental-app-only',
      '--output',
    ])
    expect(appOnly.exitCode).toBe(0)
    const appRoutes = JSON.parse(
      readFileSync(
        path.join(next.testDir, '.next/diagnostics/analyze/data/routes.json'),
        'utf8'
      )
    )
    expect(appRoutes).toContain('/')
    expect(appRoutes).not.toContain('/about')

    for (const flag of ['--no-mangling', '--profile']) {
      const flagged = await next.runCommand(['analyze', flag, '--output'])
      expect(flagged.exitCode).toBe(0)
    }

    const named = await next.runCommand([
      'analyze',
      '--baseline-name',
      'cache-reuse',
      '--output',
    ])
    expect(named.exitCode).toBe(0)
    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const metadata = JSON.parse(
      readFileSync(path.join(analyzeDir, 'data/metadata.json'), 'utf8')
    )
    expect(metadata.baselineName).toBe('cache-reuse')
    const history = JSON.parse(
      readFileSync(path.join(analyzeDir, 'history/history.json'), 'utf8')
    )
    expect(history.snapshots.length).toBeGreaterThan(0)

    const analyzedBuild = await next.build({ args: ['--analyze'] })
    expect(analyzedBuild.exitCode).toBe(0)
    expect(
      existsSync(
        path.join(next.testDir, '.next/diagnostics/analyze/data/analyze.data')
      )
    ).toBe(true)
  }, 240_000)
})
