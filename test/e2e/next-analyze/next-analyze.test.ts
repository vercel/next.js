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
        required: ['route'],
        additionalProperties: false,
      },
      example: { route: '/', environment: 'client' },
    })
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

        const comparison = await next.runCommand([
          'experimental-analyze',
          '--query',
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
