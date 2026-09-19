import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'

describe('next experimental-analyze', () => {
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

  it('serves the UI and points agents to CLI discovery', async () => {
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
      .runCommand(['experimental-analyze', '--port', '0'], {
        onStdout(msg) {
          stdoutBuffer += msg
          const urlMatch = stdoutBuffer.match(/http:\/\/[^\s]+/)
          if (
            urlMatch &&
            stdoutBuffer.includes('next experimental-analyze --list-queries')
          ) {
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
      expect(stdoutBuffer).toContain(
        'For agent-readable bundle queries, run: next experimental-analyze --list-queries'
      )
      expect(stdoutBuffer).not.toContain('MCP')
      expect((await fetch(`${url}/mcp`)).status).toBe(404)
    } finally {
      serveProcess?.kill()
      await exit.catch(() => {})
    }
  })
  it('lists agent-readable queries without analyzer data', async () => {
    const result = await next.runCommand([
      'experimental-analyze',
      '--list-queries',
      '--analyze-dir',
      path.join(next.testDir, 'missing-analyzer-data'),
    ])
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    const listed = JSON.parse(result.stdout)
    expect(listed.queries.map((query: { name: string }) => query.name)).toEqual(
      [
        'get_bundle_overview',
        'query_bundle_sources',
        'explain_bundle_source',
        'compare_bundles',
      ]
    )
    expect(
      listed.queries.find(
        (query: { name: string }) => query.name === 'query_bundle_sources'
      )
    ).toMatchObject({
      inputSchema: {
        properties: {
          loadScopes: {
            type: 'array',
            items: {
              enum: ['initial', 'async', 'traced', 'asset', 'unknown'],
            },
          },
        },
        required: ['route'],
        additionalProperties: false,
      },
      example: {
        route: '/',
        environment: 'client',
        loadScopes: ['initial'],
      },
    })
  })
  ;['-o', '--output'].forEach((flag) => {
    describe(`with ${flag} flag`, () => {
      it('writes output to .next/diagnostics/analyze path', async () => {
        const defaultOutputPath = path.join(
          next.testDir,
          '.next/diagnostics/analyze'
        )
        rmSync(defaultOutputPath, { recursive: true, force: true })

        const { exitCode, stderr, stdout } = await next.runCommand([
          'experimental-analyze',
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

        const query = await next.runCommand([
          'experimental-analyze',
          '--query',
          'get_bundle_overview',
          '--input',
          '{"limit":1}',
        ])
        expect(query.exitCode).toBe(0)
        const overview = JSON.parse(query.stdout)
        expect(overview).toMatchObject({
          pagination: { limit: 1, returned: 1 },
          routes: [{ route: expect.any(String), rawSize: expect.any(Number) }],
        })

        const sources = await next.runCommand([
          'experimental-analyze',
          '--query',
          'query_bundle_sources',
          '--input',
          '{"route":"/","limit":1}',
        ])
        expect(sources.exitCode).toBe(0)
        const sourceResult = JSON.parse(sources.stdout)
        expect(sourceResult).toMatchObject({
          route: '/',
          sources: [{ sourcePath: expect.any(String) }],
        })

        const explanation = await next.runCommand([
          'experimental-analyze',
          '--query',
          'explain_bundle_source',
          '--input',
          JSON.stringify({
            route: '/',
            sourcePath: sourceResult.sources[0].sourcePath,
            maxDepth: 2,
          }),
        ])
        expect(explanation.exitCode).toBe(0)
        expect(JSON.parse(explanation.stdout)).toMatchObject({
          route: '/',
          sourcePath: sourceResult.sources[0].sourcePath,
          routeEntryDetection: { heuristic: true },
        })

        async function sourcesFor(
          search: string,
          loadScopes?: string[],
          groupBy = 'source'
        ) {
          const result = await next.runCommand([
            'experimental-analyze',
            '--query',
            'query_bundle_sources',
            '--input',
            JSON.stringify({
              route: '/',
              environment: 'client',
              search,
              loadScopes,
              groupBy,
              limit: 100,
            }),
          ])
          expect(result.exitCode).toBe(0)
          return JSON.parse(result.stdout)
        }

        const syncSources = await sourcesFor('app/sync.ts')
        expect(syncSources.sources[0]).toMatchObject({
          sourcePath: expect.stringContaining('app/sync.ts'),
          loadScopes: ['initial'],
          worker: { detected: false, heuristic: true },
        })
        const lazySources = await sourcesFor('app/lazy.ts')
        expect(lazySources.sources[0]).toMatchObject({
          sourcePath: expect.stringContaining('app/lazy.ts'),
          loadScopes: ['async'],
        })
        const workerSources = await sourcesFor('app/report.worker.ts')
        expect(workerSources.sources[0]).toMatchObject({
          loadScopes: ['async'],
          worker: { detected: true, heuristic: true },
        })
        const asyncSources = await sourcesFor('app/', ['async'])
        expect(
          asyncSources.sources.map(
            (source: { sourcePath: string }) => source.sourcePath
          )
        ).toEqual(
          expect.arrayContaining([
            expect.stringContaining('app/lazy.ts'),
            expect.stringContaining('app/report.worker.ts'),
          ])
        )
        expect(
          asyncSources.sources.some((source: { sourcePath: string }) =>
            source.sourcePath.includes('app/sync.ts')
          )
        ).toBe(false)

        const packages = await sourcesFor('node_modules/', undefined, 'package')
        expect(
          packages.sources.some(
            (source: { loadScopes: string[] }) =>
              source.loadScopes.includes('initial') &&
              source.loadScopes.includes('async')
          )
        ).toBe(true)
        const scopeOrder = ['initial', 'async', 'traced', 'asset', 'unknown']
        for (const source of packages.sources) {
          expect(source.loadScopes).toEqual(
            scopeOrder.filter((scope) => source.loadScopes.includes(scope))
          )
        }

        const lazyExplanation = await next.runCommand([
          'experimental-analyze',
          '--query',
          'explain_bundle_source',
          '--input',
          JSON.stringify({
            route: '/',
            environment: 'client',
            sourcePath: lazySources.sources[0].sourcePath,
          }),
        ])
        expect(lazyExplanation.exitCode).toBe(0)
        const lazyEvidence = JSON.parse(lazyExplanation.stdout)
        expect(lazyEvidence).toMatchObject({
          loadScopes: ['async'],
          firstAsyncBoundary: {
            importer: { path: expect.any(String) },
            dependency: { path: expect.any(String) },
          },
          nearestProjectImporter: {
            path: expect.stringContaining('app/page.tsx'),
          },
          nearestClientBoundary: {
            path: expect.stringContaining('app/page.tsx'),
          },
        })
        expect(
          lazyEvidence.entryToSourceChain.chain.at(-1).module.path
        ).toContain('app/lazy.ts')

        async function compare(input: Record<string, unknown>) {
          return next.runCommand([
            'experimental-analyze',
            '--query',
            'compare_bundles',
            '--input',
            JSON.stringify(input),
          ])
        }

        const unavailable = await compare({
          baselineSnapshot: overview.snapshot.id,
        })
        expect(unavailable.exitCode).toBe(1)
        expect(JSON.parse(unavailable.stderr)).toMatchObject({
          error: 'No distinct baseline snapshot is available',
          availableSnapshots: [{ id: overview.snapshot.id }],
        })

        const baseline = {
          ...overview.snapshot,
          id: '20000101-000000-abcdef0',
          createdAt: '2000-01-01T00:00:00.000Z',
        }
        const baselineDir = path.join(defaultOutputPath, 'history', baseline.id)
        cpSync(path.join(defaultOutputPath, 'data'), baselineDir, {
          recursive: true,
        })
        writeFileSync(
          path.join(baselineDir, 'metadata.json'),
          JSON.stringify(baseline)
        )
        writeFileSync(
          path.join(defaultOutputPath, 'history/history.json'),
          JSON.stringify({ snapshots: [overview.snapshot, baseline] })
        )

        const comparison = await compare({
          baselineSnapshot: baseline.id,
          granularity: 'package',
          route: '/',
          environment: 'client',
          limit: 1,
        })
        expect(comparison.exitCode).toBe(0)
        expect(JSON.parse(comparison.stdout).effectiveInputs).toMatchObject({
          baselineSnapshot: baseline.id,
          comparisonSnapshot: overview.snapshot.id,
          granularity: 'package',
          route: '/',
          environment: 'client',
          limit: 1,
        })

        for (const input of [
          { baselineSnapshot: overview.snapshot.id },
          { baselineSnapshot: baseline.id, route: '/' },
          { baselineSnapshot: baseline.id, groupBy: 'package' },
          { baselineSnapshot: '20010101-000000-abcdef0' },
        ]) {
          const invalid = await compare(input)
          expect(invalid.exitCode).toBe(1)
          expect(JSON.parse(invalid.stderr)).toHaveProperty('error')
        }
      })
    })
  })
})
