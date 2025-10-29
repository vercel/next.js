import { NextInstance, createNext } from 'e2e-utils'
import { trace } from 'next/dist/trace'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { createDefineEnv, loadBindings } from 'next/dist/build/swc'
import type {
  Diagnostics,
  Issue,
  Project,
  RawEntrypoints,
  StyledString,
  TurbopackResult,
  UpdateInfo,
} from 'next/dist/build/swc/types'
import loadConfig from 'next/dist/server/config'
import path, { join } from 'path'
import { spawnSync } from 'child_process'

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
  return `import Client from "./client.tsx";
export default () => <div>${text}<Client /></div>;`
}

describe('next.rs api writeToDisk multiple times', () => {
  it('should allow to write to disk multiple times', async () => {
    let next: NextInstance

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
        'app/layout.tsx':
          'export default function RootLayout({ children }: { children: any }) { return (<html><body>{children}</body></html>)}',
        'app/loading.tsx':
          'export default function Loading() { return <>Loading</> }',
        'app/app/page.tsx': appPageCode('hello world'),
        'app/app/client.tsx':
          '"use client";\nexport default () => <div>hello world</div>',
        'app/app-edge/page.tsx':
          'export default () => <div>hello world</div>\nexport const runtime = "edge"',
        'app/app-nodejs/page.tsx':
          'export default () => <div>hello world</div>',
        'app/route-nodejs/route.ts':
          'export function GET() { return Response.json({ hello: "world" }) }',
        'app/route-edge/route.ts':
          'export function GET() { return Response.json({ hello: "world" }) }\nexport const runtime = "edge"',
        'server.js': `
process.title = 'next.rs api run test';
const path = require('path');
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');
const loadConfig = require('next/dist/server/config');
const { loadBindings } = require('next/dist/build/swc');
const { createDefineEnv } = require('next/dist/build/swc');
async function main() {
  const nextConfig = await loadConfig.default(
    PHASE_DEVELOPMENT_SERVER,
    __dirname
  );
  const bindings = await loadBindings();
  const rootPath = __dirname;
  const distDir = '.next';
  const project = await bindings.turbo.createProject({
    env: {},
    nextConfig: nextConfig,
    rootPath,
    projectPath: '.',
    distDir,
    watch: {
      enable: true,
    },
    dev: true,
    defineEnv: createDefineEnv({
      projectPath: __dirname,
      isTurbopack: true,
      clientRouterFilters: undefined,
      config: nextConfig,
      dev: true,
      distDir: path.join(rootPath, distDir),
      fetchCacheKeyPrefix: undefined,
      hasRewrites: false,
      middlewareMatchers: undefined,
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
    }),
    buildId: 'development',
    encryptionKey: '12345',
    previewProps: {
      previewModeId: 'development',
      previewModeEncryptionKey: '12345',
      previewModeSigningKey: '12345',
    },
    browserslistQuery: 'last 2 versions',
    noMangling: false,
    currentNodeJsVersion: '18.0.0',
  });

  const entrypointsSubscription = project.entrypointsSubscribe();
  const entrypoints = (await entrypointsSubscription.next()).value;

  const RUNS = 10000;
  async function compileRoute(route) {
    const endpoint = route.endpoint ?? route.htmlEndpoint ?? route.pages[0].htmlEndpoint;
    if (!endpoint) {
      console.log('unexpected route', route);
      process.exit(1);
    }
    for (let i = 0; i < RUNS; i++) {
      await endpoint.writeToDisk();
    }
  }

  for (const [name, route] of entrypoints.routes) {
    console.log(name, route.type);

    console.log('first runs');
    await compileRoute(route);
    gc(true);
    let old = process.memoryUsage();
    const initial = old;
    let stabilized = false;
    for (let j = 0; j < 10; j++) {
      await compileRoute(route);
      gc(true);
      const newMemory = process.memoryUsage();
      const addedMemory = newMemory.rss - old.rss;
      console.log(\`#\${j} \${RUNS} runs add \${addedMemory} bytes of memory, memory since first runs \${newMemory.rss - initial.rss} bytes\`);
      old = newMemory;
      if (addedMemory === 0) {
        console.log('memory usage stabilized');
        stabilized = true;
        break;
      }
    }
    if (!stabilized) {
      console.log('memory usage did not stabilize, failing');
      process.exit(1);
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

        `,
      },
    })

    const result = spawnSync(
      'node',
      ['--expose-gc', join(next.testDir, 'server.js')],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
        },
      }
    )
    expect(result.status).toBe(0)

    await next.destroy()
  })
})

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
          'app/layout.tsx':
            'export default function RootLayout({ children }: { children: any }) { return (<html><body>{children}</body></html>)}',
          'app/loading.tsx':
            'export default function Loading() { return <>Loading</> }',
          'app/app/page.tsx': appPageCode('hello world'),
          'app/app/client.tsx':
            '"use client";\nexport default () => <div>hello world</div>',
          'app/app-edge/page.tsx':
            'export default () => <div>hello world</div>\nexport const runtime = "edge"',
          'app/app-nodejs/page.tsx':
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
    const nextConfig = await loadConfig(PHASE_DEVELOPMENT_SERVER, next.testDir)
    const bindings = await loadBindings()
    const rootPath = process.env.NEXT_SKIP_ISOLATE
      ? path.resolve(__dirname, '../../..')
      : next.testDir
    const distDir = '.next'
    project = await bindings.turbo.createProject({
      env: {},
      nextConfig: nextConfig,
      rootPath,
      projectPath: path.relative(rootPath, next.testDir) || '.',
      distDir,
      watch: {
        enable: true,
      },
      dev: true,
      defineEnv: createDefineEnv({
        projectPath: next.testDir,
        isTurbopack: true,
        clientRouterFilters: undefined,
        config: nextConfig,
        dev: true,
        distDir: path.join(rootPath, distDir),
        fetchCacheKeyPrefix: undefined,
        hasRewrites: false,
        middlewareMatchers: undefined,
        rewrites: {
          beforeFiles: [],
          afterFiles: [],
          fallback: [],
        },
      }),
      buildId: 'development',
      encryptionKey: '12345',
      previewProps: {
        previewModeId: 'development',
        previewModeEncryptionKey: '12345',
        previewModeSigningKey: '12345',
      },
      browserslistQuery: 'last 2 versions',
      noMangling: false,
      currentNodeJsVersion: '18.0.0',
    })
    projectUpdateSubscription = filterMapAsyncIterator(
      project.updateInfoSubscribe(1000),
      (update) => (update.updateType === 'end' ? update.value : undefined)
    )
  })

  it('should detect the correct routes', async () => {
    const entrypointsSubscription = project.entrypointsSubscribe()
    const entrypoints = await entrypointsSubscription.next()
    expect(entrypoints.done).toBe(false)
    if (!('routes' in entrypoints.value)) {
      throw new Error('Entrypoints not available due to compilation errors')
    }

    expect(Array.from(entrypoints.value.routes.keys()).sort()).toEqual([
      '/',
      '/_not-found',
      '/api/edge',
      '/api/nodejs',
      '/app',
      '/app-edge',
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
    await entrypointsSubscription.return()
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
      const entrypoints: TurbopackResult<RawEntrypoints | {}> = (
        await entrypointsSubscribtion.next()
      ).value
      if (!('routes' in entrypoints)) {
        throw new Error('Entrypoints not available due to compilation errors')
      }

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
          const result = await route.pages[0].htmlEndpoint.writeToDisk()
          expect(result.type).toBe(runtime)
          expect(result.config).toEqual(config)
          expect(normalizeIssues(result.issues)).toMatchSnapshot('issues')
          expect(normalizeDiagnostics(result.diagnostics)).toMatchSnapshot(
            'diagnostics'
          )

          const result2 = await route.pages[0].rscEndpoint.writeToDisk()
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
      file: 'app/app/client.tsx',
      content: '"use client";\nexport default () => <div>hello world2</div>',
      expectedUpdate: '/app/app/client.tsx',
      expectedServerSideChange: false,
    },
    {
      name: 'server-side change on a app page',
      path: '/app',
      type: 'app-page',
      file: 'app/app/page.tsx',
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
        const entrypoints: TurbopackResult<RawEntrypoints | {}> = (
          await entrypointsSubscribtion.next()
        ).value
        if (!('routes' in entrypoints)) {
          throw new Error('Entrypoints not available due to compilation errors')
        }

        const route = entrypoints.routes.get(path)
        entrypointsSubscribtion.return()

        expect(route.type).toBe(type)

        let serverSideSubscription:
          | AsyncIterableIterator<TurbopackResult>
          | undefined
        switch (route.type) {
          case 'page': {
            await route.htmlEndpoint.writeToDisk()
            serverSideSubscription =
              await route.dataEndpoint.serverChanged(false)
            break
          }
          case 'app-page': {
            await route.pages[0].htmlEndpoint.writeToDisk()
            serverSideSubscription =
              await route.pages[0].rscEndpoint.serverChanged(false)
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
            expect(normalizeIssues(result.value.issues)).toEqual([])
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
    const entrypoints: TurbopackResult<RawEntrypoints | {}> = (
      await entrypointsSubscribtion.next()
    ).value
    if (!('routes' in entrypoints)) {
      throw new Error('Entrypoints not available due to compilation errors')
    }

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

    const count = process.env.NEXT_TEST_CI ? 300 : 1000
    for (let i = 0; i < count; i++) {
      await next.patchFile(file, nextContent)
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
