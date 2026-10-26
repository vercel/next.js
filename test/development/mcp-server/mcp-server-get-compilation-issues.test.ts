import { existsSync } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

type Issue = { severity: string; filePath: string; title: string }
type CompilationResult = { routeSpecifier: string; issues: Issue[] }

// Route compilation is Turbopack-only; discovery must not trigger compilation.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'mcp-server get_compilation_issues tool',
  () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'compilation-errors-app'),
    })

    async function request(method: string, params?: unknown) {
      const response = await fetch(`${next.url}/_next/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'compilation-issues',
          method,
          params,
        }),
      })
      expect(response.ok).toBe(true)
      const text = await response.text()
      const match = text.match(/data: ({.*})/s)
      expect(match).toBeTruthy()
      const envelope = JSON.parse(match![1])
      return envelope.error ? { error: envelope.error } : envelope.result
    }

    function callTool(
      args: Record<string, unknown>,
      name = 'get_compilation_issues'
    ) {
      return request('tools/call', { name, arguments: args })
    }

    async function compile(
      args: Record<string, unknown>,
      name = 'get_compilation_issues'
    ): Promise<CompilationResult> {
      const result = await callTool(args, name)
      expect(result.isError).not.toBe(true)
      return JSON.parse(result.content[0].text)
    }

    function expectRouteErrors(result: CompilationResult, route: string) {
      expect(result.routeSpecifier).toBe(`/${route}`)
      const errors = result.issues.filter(
        (issue) => issue.severity === 'error' || issue.severity === 'fatal'
      )
      expect(errors.length).toBeGreaterThan(0)
      for (const issue of errors) {
        expect(issue.filePath).toContain(route)
        expect(typeof issue.severity).toBe('string')
        expect(typeof issue.filePath).toBe('string')
        // Titles must be formatted strings, not StyledString objects.
        expect(typeof issue.title).toBe('string')
      }
    }

    it('does no unrelated transformations during discovery, rejected calls or selected compilation', async () => {
      const marker = path.join(next.testDir, 'sentinel-transformed')
      expect(existsSync(marker)).toBe(false)
      const { tools } = await request('tools/list')
      for (const name of ['get_compilation_issues', 'compile_route']) {
        const tool = tools.find((tool: { name: string }) => tool.name === name)
        expect(tool).toBeDefined()
        expect(tool.inputSchema.properties).toMatchObject({
          routeSpecifier: { type: 'string' },
          path: { type: 'string' },
        })
        expect(tool.description).toContain('exactly one')
      }
      expect(existsSync(marker)).toBe(false)

      const empty = await callTool({})
      expect(empty.isError).toBe(true)
      expect(JSON.parse(empty.content[0].text)).toEqual({
        code: 'ROUTE_REQUIRED',
        error:
          'Provide exactly one of `routeSpecifier` or `path`. Use tools/list for capability discovery without compiling routes.',
      })
      expect(existsSync(marker)).toBe(false)

      const ambiguous = await callTool({
        routeSpecifier: '/',
        path: '/sentinel',
      })
      expect(ambiguous.isError).toBe(true)
      expect(JSON.parse(ambiguous.content[0].text)).toEqual({
        error: 'Provide exactly one of `routeSpecifier` or `path`.',
      })
      expect(existsSync(marker)).toBe(false)
      for (const args of [{ routeSpecifier: 123 }, { path: false }]) {
        const result = await callTool(args)
        expect(result.error).toMatchObject({
          code: -32602,
          message: expect.stringContaining('Invalid arguments'),
        })
        expect(existsSync(marker)).toBe(false)
      }
      for (const args of [
        { routeSpecifier: '/does-not-exist' },
        { path: '/does-not-exist' },
      ]) {
        const result = await callTool(args)
        expect(result.isError).toBe(true)
        expect(JSON.parse(result.content[0].text)).toMatchObject({
          notFound: true,
        })
        expect(existsSync(marker)).toBe(false)
      }
      for (const name of ['get_compilation_issues', 'compile_route']) {
        expect(await compile({ routeSpecifier: '/' }, name)).toEqual({
          routeSpecifier: '/',
          issues: [],
        })
        expect(existsSync(marker)).toBe(false)
      }
      expect(await compile({ path: '/?ref=preflight' })).toEqual({
        routeSpecifier: '/',
        issues: [],
      })
      expect(existsSync(marker)).toBe(false)

      // Positive control: the unrelated route really does trigger this loader.
      expect(await compile({ routeSpecifier: '/sentinel' })).toEqual({
        routeSpecifier: '/sentinel',
        issues: [],
      })
      expect(existsSync(marker)).toBe(true)
    })

    it.each(['missing-module', 'syntax-error', 'css-composes-error'])(
      'returns formatted issues only for the selected %s route without a browser',
      async (route) => {
        expectRouteErrors(await compile({ routeSpecifier: `/${route}` }), route)
      }
    )

    it('keeps repeated requests scoped and clears issues after a fix', async () => {
      expectRouteErrors(
        await compile({ routeSpecifier: '/missing-module' }),
        'missing-module'
      )
      expect(await compile({ routeSpecifier: '/' })).toEqual({
        routeSpecifier: '/',
        issues: [],
      })
      expectRouteErrors(
        await compile({ path: '/missing-module' }, 'compile_route'),
        'missing-module'
      )
      await next.patchFile(
        'app/missing-module/page.tsx',
        'export default function Page() { return <p>Fixed</p> }',
        async () => {
          await retry(async () => {
            expect(
              await compile({ routeSpecifier: '/missing-module' })
            ).toEqual({ routeSpecifier: '/missing-module', issues: [] })
          })
        }
      )
    })

    it('does not mix issues from concurrent calls to the two tool aliases', async () => {
      const [missing, syntax] = await Promise.all([
        compile({ routeSpecifier: '/missing-module' }),
        compile({ routeSpecifier: '/syntax-error' }, 'compile_route'),
      ])
      expectRouteErrors(missing, 'missing-module')
      expectRouteErrors(syntax, 'syntax-error')
    })

    it('includes a selected page layout and its shared imports', async () => {
      const result = await compile({ routeSpecifier: '/broken-layout/child' })
      expect(result.routeSpecifier).toBe('/broken-layout/child')
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: expect.stringContaining('broken-layout/layout.tsx'),
            title: expect.stringContaining('shared-layout-dependency'),
          }),
        ])
      )
      expect(await compile({ path: '/' })).toEqual({
        routeSpecifier: '/',
        issues: [],
      })
    })

    it.each(['_app', '_document'])(
      'includes Pages %s issues only when compiling a Pages page',
      async (frameworkPage) => {
        await next.patchFile(
          `pages/${frameworkPage}.tsx`,
          `import Missing from 'missing-pages-framework-dependency'
export default Missing`,
          async () => {
            await retry(async () => {
              const result = await compile({ routeSpecifier: '/legacy' })
              expect(result.routeSpecifier).toBe('/legacy')
              expect(result.issues).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    filePath: expect.stringContaining(`${frameworkPage}.tsx`),
                    title: expect.stringContaining(
                      'missing-pages-framework-dependency'
                    ),
                  }),
                ])
              )
            })
            expect(await compile({ routeSpecifier: '/' })).toEqual({
              routeSpecifier: '/',
              issues: [],
            })
          }
        )
      }
    )
  }
)
