import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

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
      'explain_route_module',
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
    expect(queryHelp.stdout).toContain('"required": [')
    expect(queryHelp.stdout).toContain('"route": "/"')
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
          pagination: { limit: 1, returned: 1 },
          routes: [{ route: expect.any(String), rawSize: expect.any(Number) }],
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
          sources: [
            {
              sourcePath: expect.any(String),
              chunkCount: expect.any(Number),
            },
          ],
        })
        expect(JSON.parse(sources.stdout).sources[0]).not.toHaveProperty(
          'chunks'
        )

        const outputs = await next.runCommand([
          'experimental-analyze',
          'query',
          'get_route_outputs',
          '--input',
          '{"route":"/","kinds":["css","font","image"]}',
        ])
        expect(outputs.exitCode).toBe(0)
        expect(JSON.parse(outputs.stdout)).toMatchObject({
          outputs: expect.arrayContaining([
            expect.objectContaining({ kind: 'css' }),
            expect.objectContaining({ kind: 'font' }),
            expect.objectContaining({ kind: 'image' }),
          ]),
        })

        const cssAssets = await next.runCommand([
          'experimental-analyze',
          'query',
          'get_css_assets',
          '--input',
          '{"route":"/"}',
        ])
        expect(cssAssets.exitCode).toBe(0)
        expect(JSON.parse(cssAssets.stdout)).toMatchObject({
          relationshipEvidence: 'output-reference',
          assets: expect.arrayContaining([
            expect.objectContaining({ assetKind: 'font' }),
            expect.objectContaining({ assetKind: 'image' }),
          ]),
        })

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
        const explanationResult = JSON.parse(explanation.stdout)
        expect(explanationResult).toMatchObject({
          route: '/',
          sourcePath: sourceResult.sources[0].sourcePath,
          routeEntryDetection: { heuristic: false },
          selectedModule: { ident: expect.any(String) },
        })

        const graph = await next.runCommand([
          'experimental-analyze',
          'query',
          'get_initial_import_graph',
          '--input',
          JSON.stringify({
            route: '/',
            sourcePath: sourceResult.sources[0].sourcePath,
            moduleIdent: explanationResult.selectedModule.ident,
            environment: 'total',
          }),
        ])
        expect(graph.exitCode).toBe(0)
        expect(JSON.parse(graph.stdout)).toMatchObject({
          graph: {
            complete: true,
            nodes: expect.any(Array),
            edges: expect.any(Array),
            sccs: expect.any(Array),
            sccEvidence: 'producer-petgraph',
          },
        })

        const comparison = await next.runCommand([
          'experimental-analyze',
          'query',
          'compare_bundles',
          '--input',
          JSON.stringify({ baselineSnapshot: overview.snapshot.id, limit: 1 }),
        ])
        expect(comparison.exitCode).toBe(0)
        expect(JSON.parse(comparison.stdout)).toMatchObject({
          counts: { identical: expect.any(Number) },
          rows: [{ status: 'identical', delta: 0 }],
        })
      })
    })
  })
})
