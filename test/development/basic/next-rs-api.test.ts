import { NextInstance, createNext } from 'e2e-utils'
import { trace } from 'next/src/trace'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import {
  createDefineEnv,
  Diagnostics,
  Entrypoints,
  Issue,
  loadBindings,
  Project,
  StyledString,
  TurbopackResult,
  UpdateInfo,
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

function styledStringToMarkdown(styled: StyledString): string {
  switch (styled.type) {
    case 'text':
      return styled.value
    case 'strong':
      return '**' + styled.value + '**'
    case 'code':
      return '`' + styled.value + '`'
    case 'line':
      return styled.value.map(styledStringToMarkdown).join('')
    case 'stack':
      return styled.value.map(styledStringToMarkdown).join('\n')
    default:
      throw new Error('Unknown StyledString type', styled)
  }
}

function normalizeIssues(issues: Issue[]) {
  return issues
    .map((issue) => ({
      ...issue,
      detail:
        issue.detail && normalizePath(styledStringToMarkdown(issue.detail)),
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

async function* filterMapAsyncIterator<T, U>(
  iterator: AsyncIterableIterator<T>,
  transform: (t: T) => U | undefined
): AsyncGenerator<Awaited<U>> {
  for await (const val of iterator) {
    const mapped = transform(val)
    if (mapped !== undefined) {
      yield mapped
    }
  }
}

/**
 * Drains the stream until no value is available for 100ms, then returns the next value.
 */
async function drainAndGetNext<T>(stream: AsyncIterableIterator<T>) {
  while (true) {
    const next = stream.next()
    const result = await Promise.race([
      new Promise((r) => setTimeout(() => r({ next }), 100)),
      next.then(() => undefined),
    ])

    if (result) return result
  }
}

function pagesIndexCode(text, props = {}) {
  return `import props from "../lib/props.js";
export default () => <div>${text}</div>;
export function getServerSideProps() { return { props: { ...props, ...${JSON.stringify(
    props
  )}} } }`
}

function appPageCode(text) {
  return `import Client from "./client.ts";
export default () => <div>${text}<Client /></div>;`
}

describe('next.rs api', () => {
  let next: NextInstance
  beforeAll(async () => {
    await trace('setup next instance').traceAsyncFn(async (rootSpan) => {
      next = await createNext({
        skipStart: true,
        files: {
          'pages/index.js': pagesIndexCode('hello world'),
          'lib/props.js': 'export default {}',
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
          'app/app/page.ts': appPageCode('hello world'),
          'app/app/client.ts':
            '"use client";\nexport default () => <div>hello world</div>',
          'app/app-edge/page.ts':
            'export default () => <div>hello world</div>\nexport const runtime = "edge"',
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
  let projectUpdateSubscription: AsyncIterableIterator<UpdateInfo>
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
        ? path.resolve(__dirname, '../../..')
        : next.testDir,
      watch: true,
      serverAddr: `127.0.0.1:3000`,
      defineEnv: createDefineEnv({
        isTurbopack: true,
        allowedRevalidateHeaderKeys: undefined,
        clientRouterFilters: undefined,
        config: nextConfig,
        dev: true,
        distDir: path.join(
          process.env.NEXT_SKIP_ISOLATE
            ? path.resolve(__dirname, '../../..')
            : next.testDir,
          '.next'
        ),
        fetchCacheKeyPrefix: undefined,
        hasRewrites: false,
        middlewareMatchers: undefined,
        previewModeId: undefined,
      }),
    })
    projectUpdateSubscription = filterMapAsyncIterator(
      project.updateInfoSubscribe(1000),
      (update) => (update.updateType === 'end' ? update.value : undefined)
    )
  })

  it('should detect the correct routes', async () => {
    const entrypointsSubscribtion = project.entrypointsSubscribe()
    const entrypoints = await entrypointsSubscribtion.next()
    expect(entrypoints.done).toBe(false)
    expect(Array.from(entrypoints.value.routes.keys()).sort()).toEqual([
      '/',
      '/_not-found',
      '/api/edge',
      '/api/nodejs',
      '/app',
      '/app-edge',
      '/app-nodejs',
      '/not-found',
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
    {
      name: 'app edge page',
      path: '/app-edge',
      type: 'app-page',
      runtime: 'edge',
      config: {},
    },
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

          const result2 = await route.dataEndpoint.writeToDisk()
          expect(result2.type).toBe(runtime)
          expect(result2.config).toEqual(config)
          expect(normalizeIssues(result2.issues)).toMatchSnapshot('data issues')
          expect(normalizeDiagnostics(result2.diagnostics)).toMatchSnapshot(
            'data diagnostics'
          )
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

  const hmrCases: {
    name: string
    path: string
    type: string
    file: string
    content: string
    expectedUpdate: string | false
    expectedServerSideChange: boolean
  }[] = [
    {
      name: 'client-side change on a page',
      path: '/',
      type: 'page',
      file: 'pages/index.js',
      content: pagesIndexCode('hello world2'),
      expectedUpdate: '/pages/index.js',
      expectedServerSideChange: false,
    },
    {
      name: 'server-side change on a page',
      path: '/',
      type: 'page',
      file: 'lib/props.js',
      content: 'export default { some: "prop" }',
      expectedUpdate: false,
      expectedServerSideChange: true,
    },
    {
      name: 'client and server-side change on a page',
      path: '/',
      type: 'page',
      file: 'pages/index.js',
      content: pagesIndexCode('hello world2', { another: 'prop' }),
      expectedUpdate: '/pages/index.js',
      expectedServerSideChange: true,
    },
    {
      name: 'client-side change on a app page',
      path: '/app',
      type: 'app-page',
      file: 'app/app/client.ts',
      content: '"use client";\nexport default () => <div>hello world2</div>',
      expectedUpdate: '/app/app/client.ts',
      expectedServerSideChange: false,
    },
    {
      name: 'server-side change on a app page',
      path: '/app',
      type: 'app-page',
      file: 'app/app/page.ts',
      content: appPageCode('hello world2'),
      expectedUpdate: false,
      expectedServerSideChange: true,
    },
  ]

  for (const {
    name,
    path,
    type,
    file,
    content,
    expectedUpdate,
    expectedServerSideChange,
  } of hmrCases) {
    for (let i = 0; i < 3; i++)
      // eslint-disable-next-line no-loop-func
      it(`should have working HMR on ${name} ${i}`, async () => {
        console.log('start')
        await new Promise((r) => setTimeout(r, 1000))
        const entrypointsSubscribtion = project.entrypointsSubscribe()
        const entrypoints: TurbopackResult<Entrypoints> = (
          await entrypointsSubscribtion.next()
        ).value
        const route = entrypoints.routes.get(path)
        entrypointsSubscribtion.return()

        expect(route.type).toBe(type)

        let serverSideSubscription:
          | AsyncIterableIterator<TurbopackResult>
          | undefined
        switch (route.type) {
          case 'page': {
            await route.htmlEndpoint.writeToDisk()
            serverSideSubscription = await route.dataEndpoint.serverChanged(
              false
            )
            break
          }
          case 'app-page': {
            await route.htmlEndpoint.writeToDisk()
            serverSideSubscription = await route.rscEndpoint.serverChanged(
              false
            )
            break
          }
          default: {
            throw new Error('unknown route type')
          }
        }

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
            expect(result.value).toHaveProperty(
              'diagnostics',
              expect.toBeEmpty()
            )
          })
        )
        console.log('waiting for events')
        const { next: updateComplete } = await drainAndGetNext(
          projectUpdateSubscription
        )
        const oldContent = await next.readFile(file)
        let ok = false
        try {
          await next.patchFile(file, content)
          let foundUpdates: string[] | false = false
          let foundServerSideChange = false
          let done = false
          const result2 = await Promise.race(
            [
              (async () => {
                const merged = raceIterators(subscriptions)
                for await (const item of merged) {
                  if (done) return
                  if (item.type === 'partial') {
                    expect(item.instruction).toEqual({
                      type: 'ChunkListUpdate',
                      merged: [
                        expect.objectContaining({
                          chunks: expect.toBeObject(),
                          entries: expect.toBeObject(),
                        }),
                      ],
                    })
                    const updates = Object.keys(
                      item.instruction.merged[0].entries
                    )
                    expect(updates).not.toBeEmpty()

                    foundUpdates = foundUpdates || []
                    foundUpdates.push(
                      ...Object.keys(item.instruction.merged[0].entries)
                    )
                  }
                }
              })(),
              serverSideSubscription &&
                (async () => {
                  for await (const {
                    issues,
                    diagnostics,
                  } of serverSideSubscription) {
                    if (done) return
                    expect(issues).toBeArray()
                    expect(diagnostics).toBeArray()
                    foundServerSideChange = true
                  }
                })(),
              updateComplete.then(
                (u) => new Promise((r) => setTimeout(() => r(u), 1000))
              ),
              new Promise((r) => setTimeout(() => r('timeout'), 30000)),
            ].filter((x) => x)
          )
          done = true
          expect(result2).toMatchObject({
            done: false,
            value: {
              duration: expect.toBePositive(),
              tasks: expect.toBePositive(),
            },
          })
          if (typeof expectedUpdate === 'boolean') {
            expect(foundUpdates).toBe(false)
          } else {
            expect(
              typeof foundUpdates === 'boolean'
                ? foundUpdates
                : Array.from(new Set(foundUpdates))
            ).toEqual([expect.stringContaining(expectedUpdate)])
          }
          expect(foundServerSideChange).toBe(expectedServerSideChange)
          ok = true
        } finally {
          try {
            const { next: updateComplete2 } = await drainAndGetNext(
              projectUpdateSubscription
            )
            await next.patchFile(file, oldContent)
            await updateComplete2
          } catch (e) {
            if (ok) throw e
          }
        }
      })
  }

  it.skip('should allow to make many HMR updates', async () => {
    console.log('start')
    await new Promise((r) => setTimeout(r, 1000))
    const entrypointsSubscribtion = project.entrypointsSubscribe()
    const entrypoints: TurbopackResult<Entrypoints> = (
      await entrypointsSubscribtion.next()
    ).value
    const route = entrypoints.routes.get('/')
    entrypointsSubscribtion.return()

    if (route.type !== 'page') throw new Error('unknown route type')
    await route.htmlEndpoint.writeToDisk()

    const result = await project.hmrIdentifiersSubscribe().next()
    expect(result.done).toBe(false)
    const identifiers = result.value.identifiers

    const subscriptions = identifiers.map((identifier) =>
      project.hmrEvents(identifier)
    )
    await Promise.all(
      subscriptions.map(async (subscription) => {
        const result = await subscription.next()
        expect(result.done).toBe(false)
        expect(result.value).toHaveProperty('resource', expect.toBeObject())
        expect(result.value).toHaveProperty('type', 'issues')
        expect(result.value).toHaveProperty('diagnostics', expect.toBeEmpty())
      })
    )
    const merged = raceIterators(subscriptions)

    const file = 'pages/index.js'
    let currentContent = await next.readFile(file)
    let nextContent = pagesIndexCode('hello world2')

    const count = process.env.CI ? 300 : 1000
    for (let i = 0; i < count; i++) {
      await next.patchFileFast(file, nextContent)
      const content = currentContent
      currentContent = nextContent
      nextContent = content

      while (true) {
        const { value, done } = await merged.next()
        expect(done).toBe(false)
        if (value.type === 'partial') {
          break
        }
      }
    }
  }, 300000)
})
