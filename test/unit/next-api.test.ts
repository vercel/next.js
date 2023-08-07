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

function normalizeIssues(issues: Issue[]) {
  return issues
    .map((issue) => ({
      ...issue,
      source: issue.source && {
        ...issue.source,
        source: issue.source.source.ident,
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
  return diagnostics.sort((a, b) => {
    const a_ = JSON.stringify(a)
    const b_ = JSON.stringify(b)
    if (a_ < b_) return -1
    if (a_ > b_) return 1
    return 0
  })
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
    const entrypointsSubscribtion = await project.entrypointsSubscribe()
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
    it(`should allow to write ${name} to disk`, async () => {
      const entrypointsSubscribtion = await project.entrypointsSubscribe()
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
})
