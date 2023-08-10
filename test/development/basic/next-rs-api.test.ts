import { NextInstance, createNext } from 'e2e-utils'
import { trace } from 'next/src/trace'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import {
  Diagnostics,
  Entrypoints,
  Issue,
  loadBindings,
  Project,
  TurbopackResult,
} from 'next/src/build/swc'
import loadConfig from 'next/src/server/config'
import path from 'path'

function normalizePath(path: string) {
  return path
    .replace(/\[project\].+\/node_modules\//g, '[project]/.../node_modules/')
    .replace(
      /\[project\]\/packages\/next\//g,
      '[project]/.../node_modules/next/'
    )
}

function normalizeIssues(issues: Issue[]) {
  return issues
    .map((issue) => ({
      ...issue,
      detail: issue.detail && normalizePath(issue.detail),
      filePath: issue.filePath && normalizePath(issue.filePath),
      source: issue.source && {
        ...issue.source,
        source: normalizePath(issue.source.source.ident),
      },
    }))
    .sort((a, b) => {
      const a_ = JSON.stringify(a)
      const b_ = JSON.stringify(b)
      if (a_ < b_) return -1
      if (a_ > b_) return 1
      return 0
    })
}

function normalizeDiagnostics(diagnostics: Diagnostics[]) {
  return diagnostics
    .map((diagnostic) => {
      if (diagnostic.name === 'EVENT_BUILD_FEATURE_USAGE') {
        diagnostic.payload = Object.fromEntries(
          Object.entries(diagnostic.payload).map(([key, value]) => {
            return [
              key.replace(
                /^(x86_64|i686|aarch64)-(apple-darwin|unknown-linux-(gnu|musl)|pc-windows-msvc)$/g,
                'platform-triplet'
              ),
              value,
            ]
          })
        )
      }
      return diagnostic
    })
    .sort((a, b) => {
      const a_ = JSON.stringify(a)
      const b_ = JSON.stringify(b)
      if (a_ < b_) return -1
      if (a_ > b_) return 1
      return 0
    })
}

function raceIterators<T>(iterators: AsyncIterableIterator<T>[]) {
  const nexts = iterators.map((iterator, i) =>
    iterator.next().then((next) => ({ next, i }))
  )
  return (async function* () {
    while (true) {
      const remaining = nexts.filter((x) => x)
      if (remaining.length === 0) return
      const { next, i } = await Promise.race(remaining)
      if (!next.done) {
        yield next.value
        nexts[i] = iterators[i].next().then((next) => ({ next, i }))
      } else {
        nexts[i] = undefined
      }
    }
  })()
}

describe('next.rs api', () => {
  let next: NextInstance
  beforeAll(async () => {
    await trace('setup next instance').traceAsyncFn(async (rootSpan) => {
      next = await createNext({
        skipStart: true,
        files: {
          'pages/index.js': 'export default () => <div>hello world</div>',
          'pages/page-nodejs.js': 'export default () => <div>hello world</div>',
          'pages/page-edge.js':
            'export default () => <div>hello world</div>\nexport const config = { runtime: "experimental-edge" }',
          'pages/api/nodejs.js':
            'export default () => Response.json({ hello: "world" })',
          'pages/api/edge.js':
            'export default () => Response.json({ hello: "world" })\nexport const config = { runtime: "edge" }',
          'app/layout.ts':
            'export default function RootLayout({ children }: { children: any }) { return (<html><body>{children}</body></html>)}',
          'app/loading.ts':
            'export default function Loading() { return <>Loading</> }',
          // 'app/app-edge/page.ts': 'export default () => <div>hello world</div>\nexport const runtime = "edge"',
          'app/app-nodejs/page.ts':
            'export default () => <div>hello world</div>',
          'app/route-nodejs/route.ts':
            'export function GET() { return Response.json({ hello: "world" }) }',
          'app/route-edge/route.ts':
            'export function GET() { return Response.json({ hello: "world" }) }\nexport const runtime = "edge"',
        },
      })
    })
  })
  afterAll(() => next.destroy())

  let project: Project
  beforeAll(async () => {
    console.log(next.testDir)
    const nextConfig = await loadConfig(PHASE_DEVELOPMENT_SERVER, next.testDir)
    const bindings = await loadBindings()
    project = await bindings.turbo.createProject({
      env: {},
      jsConfig: {
        compilerOptions: {},
      },
      nextConfig: nextConfig,
      projectPath: next.testDir,
      rootPath: process.env.NEXT_SKIP_ISOLATE
        ? path.resolve(__dirname, '../..')
        : next.testDir,
      watch: true,
    })
  })

  it('should detect the correct routes', async () => {
    const entrypointsSubscribtion = project.entrypointsSubscribe()
    const entrypoints = await entrypointsSubscribtion.next()
    expect(entrypoints.done).toBe(false)
    expect(Array.from(entrypoints.value.routes.keys()).sort()).toEqual([
      '/',
      '/api/edge',
      '/api/nodejs',
      // TODO app edge pages are not supported yet
      // '/app-edge',
      '/app-nodejs',
      '/page-edge',
      '/page-nodejs',
      '/route-edge',
      '/route-nodejs',
    ])
    expect(normalizeIssues(entrypoints.value.issues)).toMatchSnapshot('issues')
    expect(normalizeDiagnostics(entrypoints.value.diagnostics)).toMatchSnapshot(
      'diagnostics'
    )
    entrypointsSubscribtion.return()
  })

  const routes = [
    {
      name: 'root page',
      path: '/',
      type: 'page',
      runtime: 'nodejs',
      config: {},
    },
    {
      name: 'pages edge api',
      path: '/api/edge',
      type: 'page-api',
      runtime: 'edge',
      config: {},
    },
    {
      name: 'pages Node.js api',
      path: '/api/nodejs',
      type: 'page-api',
      runtime: 'nodejs',
      config: {},
    },
    // TODO app edge pages are not supported yet
    // {
    //   name: 'app edge page',
    //   path: '/app-edge',
    //   type: 'app-page',
    //   runtime: 'edge',
    //   config: {},
    // },
    {
      name: 'app Node.js page',
      path: '/app-nodejs',
      type: 'app-page',
      runtime: 'nodejs',
      config: {},
    },
    {
      name: 'pages edge page',
      path: '/page-edge',
      type: 'page',
      runtime: 'edge',
      config: {},
    },
    {
      name: 'pages Node.js page',
      path: '/page-nodejs',
      type: 'page',
      runtime: 'nodejs',
      config: {},
    },
    {
      name: 'app edge route',
      path: '/route-edge',
      type: 'app-route',
      runtime: 'edge',
      config: {},
    },
    {
      name: 'app Node.js route',
      path: '/route-nodejs',
      type: 'app-route',
      runtime: 'nodejs',
      config: {},
    },
  ]
  for (const { name, path, type, runtime, config } of routes) {
    // eslint-disable-next-line no-loop-func
    it(`should allow to write ${name} to disk`, async () => {
      const entrypointsSubscribtion = project.entrypointsSubscribe()
      const entrypoints: TurbopackResult<Entrypoints> = (
        await entrypointsSubscribtion.next()
      ).value
      const route = entrypoints.routes.get(path)
      entrypointsSubscribtion.return()

      expect(route.type).toBe(type)

      switch (route.type) {
        case 'page-api':
        case 'app-route': {
          const result = await route.endpoint.writeToDisk()
          expect(result.type).toBe(runtime)
          expect(result.config).toEqual(config)
          expect(normalizeIssues(result.issues)).toMatchSnapshot('issues')
          expect(normalizeDiagnostics(result.diagnostics)).toMatchSnapshot(
            'diagnostics'
          )
          break
        }
        case 'page': {
          const result = await route.htmlEndpoint.writeToDisk()
          expect(result.type).toBe(runtime)
          expect(result.config).toEqual(config)
          expect(normalizeIssues(result.issues)).toMatchSnapshot('issues')
          expect(normalizeDiagnostics(result.diagnostics)).toMatchSnapshot(
            'diagnostics'
          )

          // TODO This crashes
          // const result2 = await route.dataEndpoint.writeToDisk()
          // expect(result2.type).toBe(runtime)
          // expect(result2.config).toEqual(config)
          // expect(normalizeIssues(result2.issues)).toMatchSnapshot('data issues')
          // expect(normalizeDiagnostics(result2.diagnostics)).toMatchSnapshot(
          //   'data diagnostics'
          // )
          break
        }
        case 'app-page': {
          const result = await route.htmlEndpoint.writeToDisk()
          expect(result.type).toBe(runtime)
          expect(result.config).toEqual(config)
          expect(normalizeIssues(result.issues)).toMatchSnapshot('issues')
          expect(normalizeDiagnostics(result.diagnostics)).toMatchSnapshot(
            'diagnostics'
          )

          const result2 = await route.rscEndpoint.writeToDisk()
          expect(result2.type).toBe(runtime)
          expect(result2.config).toEqual(config)
          expect(normalizeIssues(result2.issues)).toMatchSnapshot('rsc issues')
          expect(normalizeDiagnostics(result2.diagnostics)).toMatchSnapshot(
            'rsc diagnostics'
          )

          break
        }
        default: {
          throw new Error('unknown route type')
          break
        }
      }
    })
  }

  it('has hmr identifiers', async () => {
    const result = await project.hmrIdentifiersSubscribe().next()
    expect(result.done).toBe(false)
    const identifiers = result.value.identifiers
    expect(identifiers).toHaveProperty('length', expect.toBePositive())
    const subscriptions = identifiers.map((identifier) =>
      project.hmrEvents(identifier)
    )
    await Promise.all(
      subscriptions.map(async (subscription) => {
        const result = await subscription.next()
        expect(result.done).toBe(false)
        expect(result.value).toHaveProperty('resource', expect.toBeObject())
        expect(result.value).toHaveProperty('type', 'issues')
        expect(result.value).toHaveProperty('issues', expect.toBeEmpty())
        expect(result.value).toHaveProperty('diagnostics', expect.toBeEmpty())
      })
    )
    console.log('waiting for events')
    let updateComplete = project.updateInfoSubscribe().next()
    next.patchFile(
      'pages/index.js',
      'export default () => <div>hello world2</div>'
    )
    let foundUpdate = false
    const result2 = await Promise.race([
      (async () => {
        const merged = raceIterators(subscriptions)
        for await (const item of merged) {
          if (item.type === 'partial') {
            // there should only be a single partial update
            expect(foundUpdate).toBe(false)
            expect(item.instruction).toEqual({
              type: 'ChunkListUpdate',
              merged: [
                expect.objectContaining({
                  chunks: expect.toBeObject(),
                  entries: expect.toBeObject(),
                }),
              ],
            })
            expect(
              Object.keys(item.instruction.merged[0].entries)
            ).toContainEqual(expect.stringContaining('/pages/index.js'))
            foundUpdate = true
          }
        }
      })(),
      updateComplete,
      new Promise((r) => setTimeout(() => r('timeout'), 30000)),
    ])
    expect(result2).toMatchObject({
      done: false,
      value: {
        duration: expect.toBePositive(),
        tasks: expect.toBePositive(),
      },
    })
    expect(foundUpdate).toBe(true)
  })
})
