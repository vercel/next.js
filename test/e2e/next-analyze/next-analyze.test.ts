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
            stdoutBuffer.includes('next experimental-analyze query --help')
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
        'For agent-readable bundle queries, run: next experimental-analyze query --help'
      )
      expect(stdoutBuffer).not.toContain('MCP')
      expect((await fetch(`${url}/mcp`)).status).toBe(404)
    } finally {
      serveProcess?.kill()
      await exit.catch(() => {})
    }
  })
  it('shows concise discovery and detailed per-query help', async () => {
    const help = await next.runCommand([
      'experimental-analyze',
      'query',
      '--help',
    ])
    expect(help.exitCode).toBe(0)
    expect(help.stderr).toBe('')
    expect(help.stdout).toContain('Available queries:')
    for (const name of [
      'get_app_overview',
      'get_route_modules',
      'get_source_chunks',
      'get_route_outputs',
      'get_css_assets',
      'explain_route_module',
      'get_initial_import_graph',
      'analyze_import_edge',
      'compare_bundles',
    ]) {
      expect(help.stdout).toContain(
        `next experimental-analyze query ${name} --help`
      )
    }
    expect(help.stdout).toContain(
      'List analyzer snapshots and rank routes by raw or estimated compressed bundle contribution.'
    )
    expect(help.stdout).not.toContain('Input schema:')
    expect(help.stdout).not.toContain('Example input:')
    expect(help.stdout).not.toContain('"required": [')
    expect(help.stdout).not.toContain('"route": "/"')
    expect(help.stdout).not.toContain('"loadScopes"')

    const noName = await next.runCommand(['experimental-analyze', 'query'])
    expect(noName.exitCode).toBe(0)
    expect(noName.stdout).toBe(help.stdout)

    const queryHelp = await next.runCommand([
      'experimental-analyze',
      'query',
      'get_route_modules',
      '--help',
    ])
    expect(queryHelp.exitCode).toBe(0)
    expect(queryHelp.stderr).toBe('')
    expect(queryHelp.stdout).toContain('Query: get_route_modules')
    expect(queryHelp.stdout).toContain(
      'Query and rank source or npm-package contributions for one analyzed route.'
    )
    expect(queryHelp.stdout).toContain('Input schema:')
    expect(queryHelp.stdout).toContain('Example input:')
    expect(queryHelp.stdout).toContain('Evidence caveats:')
    expect(queryHelp.stdout).toContain('Selectable row fields (--fields):')
    expect(queryHelp.stdout).toContain('"required": [')
    expect(queryHelp.stdout).toContain('"route": "/"')
    expect(queryHelp.stdout).toContain('"loadScopes"')
    expect(queryHelp.stdout).toContain('"loadScopes": [')
    expect(queryHelp.stdout).toContain('default 500, max 2000')
    expect(queryHelp.stdout).not.toContain('get_app_overview')

    const directoryQueryHelp = await next.runCommand([
      'experimental-analyze',
      'query',
      'get_route_modules',
      next.testDir,
      '--help',
    ])
    expect(directoryQueryHelp.exitCode).toBe(0)
    expect(directoryQueryHelp.stdout).toBe(queryHelp.stdout)

    const unknownQueryHelp = await next.runCommand([
      'experimental-analyze',
      'query',
      'unknown_query',
      '--help',
    ])
    expect(unknownQueryHelp.exitCode).not.toBe(0)
    expect(unknownQueryHelp.stderr).toContain(
      'Unknown analyzer query: unknown_query'
    )

    for (const args of [
      ['--query', 'get_app_overview'],
      ['--list-queries'],
      ['query', 'get_app_overview', '--analyze-dir', 'somewhere'],
    ]) {
      const legacy = await next.runCommand(['experimental-analyze', ...args])
      expect(legacy.exitCode).not.toBe(0)
    }
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
          'query',
          'get_app_overview',
          next.testDir,
          '--input',
          '{"limit":1}',
        ])
        expect(query.exitCode).toBe(0)
        const overview = JSON.parse(query.stdout)
        expect(overview).toMatchObject({
          snapshot: {
            analysisFingerprint: {
              algorithm: 'sha256',
              version: 1,
              digest: expect.stringMatching(/^[0-9a-f]{64}$/),
            },
          },
          pagination: { limit: 1, returned: 1 },
          routes: [
            {
              route: expect.any(String),
              rawSize: expect.any(Number),
              estimatedInitialClientRawSize: expect.any(Number),
            },
          ],
        })

        for (const oldName of [
          'get_bundle_overview',
          'query_bundle_sources',
          'explain_bundle_source',
        ]) {
          const oldQuery = await next.runCommand([
            'experimental-analyze',
            'query',
            oldName,
          ])
          expect(oldQuery.exitCode).toBe(1)
          expect(JSON.parse(oldQuery.stderr)).toEqual({
            error: `Unknown analyzer query: ${oldName}`,
          })
        }

        const sources = await next.runCommand([
          'experimental-analyze',
          'query',
          'get_route_modules',
          '--input',
          '{"route":"/","limit":1}',
        ])
        expect(sources.exitCode).toBe(0)
        const sourceResult = JSON.parse(sources.stdout)
        expect(sourceResult).toMatchObject({
          route: '/',
          routeEntryDetection: { heuristic: false },
          sources: [
            {
              sourcePath: expect.any(String),
              chunkCount: expect.any(Number),
            },
          ],
        })
        expect(sourceResult.sources[0]).not.toHaveProperty('chunks')
        expect(sourceResult.sources[0]).not.toHaveProperty('chunksTruncated')

        const sourceChunks = await next.runCommand([
          'experimental-analyze',
          'query',
          'get_source_chunks',
          '--input',
          JSON.stringify({
            route: '/',
            sourcePath: sourceResult.sources[0].sourcePath,
          }),
          '--fields',
          'filename,kind,rawSize',
        ])
        expect(sourceChunks.exitCode).toBe(0)
        expect(JSON.parse(sourceChunks.stdout)).toMatchObject({
          chunks: [
            {
              filename: expect.any(String),
              kind: expect.any(String),
              rawSize: expect.any(Number),
            },
          ],
        })

        const outputs = await next.runCommand([
          'experimental-analyze',
          'query',
          'get_route_outputs',
          '--input',
          JSON.stringify({ route: '/', kinds: ['css', 'font', 'image'] }),
          '--all',
        ])
        expect(outputs.exitCode).toBe(0)
        const outputResult = JSON.parse(outputs.stdout)
        expect(outputResult.outputs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ kind: 'css' }),
            expect.objectContaining({ kind: 'font' }),
            expect.objectContaining({ kind: 'image' }),
          ])
        )
        expect(outputResult.pagination.truncated).toBe(false)

        const cssAssets = await next.runCommand([
          'experimental-analyze',
          'query',
          'get_css_assets',
          '--input',
          '{"route":"/"}',
        ])
        expect(cssAssets.exitCode).toBe(0)
        const cssAssetResult = JSON.parse(cssAssets.stdout)
        expect(['output-reference', 'unavailable']).toContain(
          cssAssetResult.relationshipEvidence
        )
        if (cssAssetResult.relationshipEvidence === 'output-reference') {
          expect(cssAssetResult.assets).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                cssFilename: expect.any(String),
                assetFilename: expect.any(String),
                emissionEvidence: 'emitted',
                requestEvidence: 'unknown',
              }),
            ])
          )
        }

        const explanation = await next.runCommand([
          'experimental-analyze',
          'query',
          'explain_route_module',
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
          routeEntryDetection: { heuristic: false },
        })

        async function sourcesFor(
          search: string,
          loadScopes?: string[],
          groupBy = 'source'
        ) {
          const result = await next.runCommand([
            'experimental-analyze',
            'query',
            'get_route_modules',
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
        const reExportedSources = await sourcesFor('app/leaf.ts')
        expect(reExportedSources.sources[0]).toMatchObject({
          sourcePath: expect.stringContaining('app/leaf.ts'),
          loadScopes: ['initial'],
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

        const reExportedExplanation = await next.runCommand([
          'experimental-analyze',
          'query',
          'explain_route_module',
          '--input',
          JSON.stringify({
            route: '/',
            environment: 'client',
            sourcePath: reExportedSources.sources[0].sourcePath,
          }),
        ])
        expect(reExportedExplanation.exitCode).toBe(0)
        const reExportedEvidence = JSON.parse(reExportedExplanation.stdout)
        expect(reExportedEvidence).toMatchObject({
          loadScopes: ['initial'],
          nearestProjectImporter: {
            path: expect.stringContaining('app/barrel.ts'),
          },
        })
        const reExportedProjectChain =
          reExportedEvidence.entryToSourceChain.chain.filter(
            (entry: { module: { path: string } }) =>
              /app\/(page\.tsx|barrel\.ts|leaf\.ts)$/.test(entry.module.path)
          )
        expect([
          ...new Set(
            reExportedProjectChain.map(
              (entry: { module: { path: string } }) => entry.module.path
            )
          ),
        ]).toEqual([
          expect.stringContaining('app/page.tsx'),
          expect.stringContaining('app/barrel.ts'),
          expect.stringContaining('app/leaf.ts'),
        ])
        expect(
          reExportedProjectChain
            .slice(0, -1)
            .every(
              (entry: { edgeKindToNext?: string }) =>
                entry.edgeKindToNext === 'sync'
            )
        ).toBe(true)

        const initialGraph = await next.runCommand([
          'experimental-analyze',
          'query',
          'get_initial_import_graph',
          '--input',
          JSON.stringify({
            route: '/',
            environment: 'client',
            sourcePath: reExportedSources.sources[0].sourcePath,
            moduleIdent: reExportedEvidence.selectedModule.ident,
          }),
        ])
        expect(initialGraph.exitCode).toBe(0)
        const graphEvidence = JSON.parse(initialGraph.stdout)
        expect(graphEvidence.graph).toMatchObject({
          complete: true,
          nodes: expect.any(Array),
          edges: expect.any(Array),
          sccs: expect.any(Array),
          sccEvidence: 'producer-petgraph',
        })
        expect(graphEvidence.graph.edges.length).toBeGreaterThan(0)
        const graphEdge = graphEvidence.graph.edges[0]
        const edgeDetail = await next.runCommand([
          'experimental-analyze',
          'query',
          'analyze_import_edge',
          '--input',
          JSON.stringify({
            route: '/',
            environment: 'client',
            sourcePath: reExportedSources.sources[0].sourcePath,
            moduleIdent: reExportedEvidence.selectedModule.ident,
            edgeId: graphEdge.edgeId,
            granularity: 'source',
          }),
        ])
        expect(edgeDetail.exitCode).toBe(0)
        const edgeEvidence = JSON.parse(edgeDetail.stdout)
        expect(edgeEvidence.totals).toMatchObject({
          moduleCount: graphEdge.leavingInitialModuleCount,
          sourceCount: graphEdge.leavingInitialSourceCount,
          rawSize: graphEdge.leavingInitialRawSize,
          compressedSize: graphEdge.leavingInitialCompressedSize,
        })

        const lazyExplanation = await next.runCommand([
          'experimental-analyze',
          'query',
          'explain_route_module',
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
            'query',
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
