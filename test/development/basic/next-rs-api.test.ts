import { nextTestSetup } from 'e2e-utils'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { createDefineEnv, loadBindings } from 'next/dist/build/swc'
import type {
  Issue,
  MemoryEvictionMode,
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
  const { next } = nextTestSetup({
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
      'app/app-nodejs/page.tsx': 'export default () => <div>hello world</div>',
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
  const projectResult = await bindings.turbo.createProject({
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
    writeRoutesHashesManifest: false,
    currentNodeJsVersion: '18.0.0',
    isPersistentCachingEnabled: false,
    nextVersion: '0.0.0',
  }, {
    turbopackMemoryEviction: 'off',
  });
  if (projectResult.issues.length > 0) {
    throw new Error(
      \`Project initialization failed: \${JSON.stringify(projectResult.issues)}\`
    );
  }
  const project = projectResult.value;

  const entrypointsSubscription = project.entrypointsSubscribe();
  const entrypoints = (await entrypointsSubscription.next()).value.value;

  const RUNS = 1000;
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

  it('should allow to write to disk multiple times', async () => {
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
  })
})

describe('next.rs api', () => {
  let project: Project
  // Stop native observation before nextTestSetup removes the fixture files.
  // shutdown also runs the project's exit handlers.
  afterAll(async () => {
    await project?.shutdown()
  })

  const { next } = nextTestSetup({
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
      'app/app-nodejs/page.tsx': 'export default () => <div>hello world</div>',
      'app/route-nodejs/route.ts':
        'export function GET() { return Response.json({ hello: "world" }) }',
      'app/route-edge/route.ts':
        'export function GET() { return Response.json({ hello: "world" }) }\nexport const runtime = "edge"',
    },
  })

  let projectUpdateSubscription: AsyncIterableIterator<UpdateInfo>
  beforeAll(async () => {
    const nextConfig = await loadConfig(PHASE_DEVELOPMENT_SERVER, next.testDir)
    const bindings = await loadBindings()
    const rootPath = process.env.NEXT_SKIP_ISOLATE
      ? path.resolve(__dirname, '../../..')
      : next.testDir
    const distDir = '.next'
    const projectResult = await bindings.turbo.createProject(
      {
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
        writeRoutesHashesManifest: false,
        currentNodeJsVersion: '18.0.0',
        isPersistentCachingEnabled: false,
        nextVersion: '0.0.0',
      },
      {
        turbopackMemoryEviction: 'off' as MemoryEvictionMode,
      }
    )
    project = projectResult.value
    const initializationIssues = normalizeIssues(projectResult.issues)
    if (initializationIssues.length > 0) {
      throw new Error(
        `Project initialization failed:\n${JSON.stringify(initializationIssues, null, 2)}`
      )
    }
    projectUpdateSubscription = filterMapAsyncIterator(
      project.updateInfoSubscribe(1000),
      (update) => (update.updateType === 'end' ? update.value : undefined)
    )
  })

  it('should detect the correct routes', async () => {
    const entrypointsSubscription = project.entrypointsSubscribe()
    const entrypoints = await entrypointsSubscription.next()
    expect(entrypoints.done).toBe(false)
    if (!('routes' in entrypoints.value.value)) {
      throw new Error('Entrypoints not available due to compilation errors')
    }

    expect(Array.from(entrypoints.value.value.routes.keys()).sort()).toEqual([
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
    expect(entrypoints.value.value.routes.get('/app')).toMatchObject({
      type: 'app-page',
      appPaths: ['/app/page'],
      isInternal: false,
    })
    expect(entrypoints.value.value.routes.get('/_not-found')).toMatchObject({
      type: 'app-page',
      appPaths: [],
      isInternal: true,
    })
    expect(entrypoints.value.value.routes.get('/route-nodejs')).toMatchObject({
      type: 'app-route',
      originalName: '/route-nodejs/route',
      runtimePage: '/route-nodejs/route',
      runtimePathname: '/route-nodejs',
    })
    expect(entrypoints.value.value.development).toMatchObject({
      hasRootNotFound: false,
      authoredPagesSpecialRoutes: [],
      files: expect.arrayContaining([
        {
          kind: 'app-layout',
          originalName: '/layout',
          sourcePath: join(next.testDir, 'app/layout.tsx'),
        },
        {
          kind: 'pages',
          originalName: '/',
          sourcePath: join(next.testDir, 'pages/index.js'),
        },
      ]),
    })
    expect(normalizeIssues(entrypoints.value.issues)).toMatchSnapshot('issues')
    await entrypointsSubscription.return()
  })

  async function waitForEntrypoints(
    subscription: ReturnType<Project['entrypointsSubscribe']>,
    matches: (entrypoints: RawEntrypoints) => boolean | undefined
  ): Promise<RawEntrypoints> {
    while (true) {
      const result = await subscription.next()
      if (result.done) throw new Error('Entrypoints subscription ended')
      if ('routes' in result.value.value && matches(result.value.value)) {
        return result.value.value
      }
    }
  }

  it('should publish authored tooling changes without creating executable routes', async () => {
    const subscription = project.entrypointsSubscribe()
    const hasSource = (entrypoints: RawEntrypoints, source: string) =>
      entrypoints.development?.files.some(
        (file) => file.sourcePath === join(next.testDir, source)
      )
    try {
      await waitForEntrypoints(subscription, () => true)
      await next.patchFile(
        'app/inventory-layout-only/layout.tsx',
        'export default function Layout({ children }) { return children }'
      )
      let entrypoints = await waitForEntrypoints(subscription, (value) =>
        hasSource(value, 'app/inventory-layout-only/layout.tsx')
      )
      expect(entrypoints.routes.has('/inventory-layout-only')).toBe(false)
      expect(entrypoints.development?.files).toContainEqual({
        kind: 'app-layout',
        originalName: '/inventory-layout-only/layout',
        sourcePath: join(next.testDir, 'app/inventory-layout-only/layout.tsx'),
      })

      // Helpers can declare a parallel slot before that slot has a page or default.
      await next.patchFile(
        'app/inventory-layout-only/@panel/helper.js',
        'export const value = 1'
      )
      entrypoints = await waitForEntrypoints(subscription, (value) =>
        value.development?.slots.some(
          (slot) =>
            slot.name === 'panel' && slot.parent === '/inventory-layout-only'
        )
      )
      expect(entrypoints.routes.has('/inventory-layout-only')).toBe(false)

      await next.patchFile(
        'app/inventory-layout-only/@multidot/helper.test.ts',
        'export const value: number = 1'
      )
      entrypoints = await waitForEntrypoints(subscription, (value) =>
        value.development?.slots.some(
          (slot) =>
            slot.name === 'multidot' && slot.parent === '/inventory-layout-only'
        )
      )
      expect(entrypoints.development?.slots).toContainEqual({
        name: 'panel',
        parent: '/inventory-layout-only',
      })
      expect(entrypoints.routes.has('/inventory-layout-only')).toBe(false)

      // The implicit children slot does not hide its nearest named parent slot.
      await next.patchFile(
        'app/inventory-layout-only/@outer/@children/helper.js',
        'export const value = 1'
      )
      entrypoints = await waitForEntrypoints(subscription, (value) =>
        value.development?.slots.some(
          (slot) =>
            slot.name === 'outer' && slot.parent === '/inventory-layout-only'
        )
      )
      expect(entrypoints.development?.slots).not.toContainEqual({
        name: 'children',
        parent: '/inventory-layout-only',
      })

      await next.patchFile(
        'app/inventory-layout-only/@declarations/types.d.ts',
        'export interface Value { value: number }'
      )
      entrypoints = await waitForEntrypoints(subscription, (value) =>
        value.development?.slots.some(
          (slot) =>
            slot.name === 'declarations' &&
            slot.parent === '/inventory-layout-only'
        )
      )
      expect(
        hasSource(
          entrypoints,
          'app/inventory-layout-only/@declarations/types.d.ts'
        )
      ).toBe(false)
      expect(entrypoints.routes.has('/inventory-layout-only')).toBe(false)

      await next.patchFile(
        'pages/inventory-declarations/types.d.ts',
        'export interface Value { value: number }'
      )
      // A sibling page makes the directory observable even though its declaration is omitted.
      await next.patchFile(
        'pages/inventory-declarations/marker.js',
        'export default function Page() { return null }'
      )
      entrypoints = await waitForEntrypoints(subscription, (value) =>
        value.routes.has('/inventory-declarations/marker')
      )
      expect(entrypoints.routes.has('/inventory-declarations/types.d')).toBe(
        false
      )
      expect(
        hasSource(entrypoints, 'pages/inventory-declarations/types.d.ts')
      ).toBe(false)

      // Renaming only the extension still needs to refresh type-generator imports.
      await next.renameFile(
        'app/inventory-layout-only/layout.tsx',
        'app/inventory-layout-only/layout.jsx'
      )
      entrypoints = await waitForEntrypoints(
        subscription,
        (value) =>
          hasSource(value, 'app/inventory-layout-only/layout.jsx') &&
          !hasSource(value, 'app/inventory-layout-only/layout.tsx')
      )
      expect(entrypoints.routes.has('/inventory-layout-only')).toBe(false)

      await next.patchFile(
        'pages/_app.js',
        'export default function App({ Component, pageProps }) { return <Component {...pageProps} /> }'
      )
      entrypoints = await waitForEntrypoints(subscription, (value) =>
        value.development?.authoredPagesSpecialRoutes.includes('/_app')
      )
      expect(entrypoints.routes.has('/_app')).toBe(false)

      await next.patchFile(
        'app/not-found.js',
        'export default function NotFound() { return <p>not found</p> }'
      )
      entrypoints = await waitForEntrypoints(
        subscription,
        (value) => value.development?.hasRootNotFound === true
      )
      expect(entrypoints.routes.get('/_not-found')).toMatchObject({
        isInternal: true,
        appPaths: [],
      })
    } finally {
      await subscription.return()
      await next.deleteFile('app/inventory-layout-only')
      await next.deleteFile('pages/inventory-declarations')
      await next.deleteFile('pages/_app.js')
      await next.deleteFile('app/not-found.js')
    }
  })

  it('should publish authored files alongside conflicting route diagnostics', async () => {
    const subscription = project.entrypointsSubscribe()
    try {
      await waitForEntrypoints(subscription, () => true)
      await next.patchFile(
        'app/page.js',
        'export default function Page() { return <p>conflicting root</p> }'
      )
      await next.patchFile(
        'app/inventory-conflict/layout.tsx',
        'export default function Layout({ children }) { return children }'
      )
      await next.patchFile(
        'app/inventory-conflict/sitemap.ts',
        'export default function sitemap() { return [] }'
      )
      while (true) {
        const result = await subscription.next()
        if (result.done) throw new Error('Entrypoints subscription ended')
        const value = result.value.value
        if (
          'development' in value &&
          value.development?.files.some(
            (file) =>
              file.sourcePath ===
              join(next.testDir, 'app/inventory-conflict/layout.tsx')
          )
        ) {
          if (
            !value.development.files.some(
              (file) =>
                file.runtimePathname === '/inventory-conflict/sitemap.xml'
            )
          )
            continue
          expect('routes' in value).toBe(true)
          if ('routes' in value)
            expect(value.routes.get('/')).toMatchObject({ type: 'conflict' })
          expect(value.development.files).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                kind: 'app-metadata',
                sourcePath: join(
                  next.testDir,
                  'app/inventory-conflict/sitemap.ts'
                ),
                runtimePathname: '/inventory-conflict/sitemap.xml',
              }),
            ])
          )
          expect(
            result.value.issues.some((issue) => issue.severity === 'error')
          ).toBe(true)
          break
        }
      }
    } finally {
      await subscription.return()
      await next.deleteFile('app/page.js')
      await next.deleteFile('app/inventory-conflict')
    }
  })

  it('should keep healthy endpoints available when a shadowed metadata file is malformed', async () => {
    const subscription = project.entrypointsSubscribe()
    const multi = `export function generateSitemaps() { return [{ id: 0 }] }
      export default function sitemap() { return [] }`
    try {
      await waitForEntrypoints(subscription, () => true)
      await next.patchFile('app/inventory-duplicate/sitemap.js', multi)
      await next.patchFile(
        'app/inventory-duplicate/sitemap.ts',
        'export default function sitemap() { return [] }'
      )
      const before = await waitForEntrypoints(
        subscription,
        (value) =>
          value.development?.files.filter(
            (file) => file.originalName === '/inventory-duplicate/sitemap'
          ).length === 2
      )
      const selected = before.routes.get('/inventory-duplicate/sitemap.xml')
      if (selected?.type !== 'app-route')
        throw new Error('Missing sitemap endpoint')
      // Determine the native winner instead of assuming filesystem enumeration order.
      const shadowed = selected.runtimePathname.endsWith('/sitemap.xml')
        ? 'app/inventory-duplicate/sitemap.js'
        : 'app/inventory-duplicate/sitemap.ts'
      // Make the loser multi-dynamic first, so the malformed source will change its tooling
      // pathname back to the single sitemap URL and produce an observable update.
      const multiPathname = '/inventory-duplicate/sitemap/[__metadata_id__]'
      if (
        !before.development?.files.some(
          (file) =>
            file.sourcePath === join(next.testDir, shadowed) &&
            file.runtimePathname === multiPathname
        )
      ) {
        await next.patchFile(shadowed, multi)
        await waitForEntrypoints(subscription, (value) =>
          value.development?.files.some(
            (file) =>
              file.sourcePath === join(next.testDir, shadowed) &&
              file.runtimePathname === multiPathname
          )
        )
      }
      await next.patchFile(shadowed, 'export default function broken(')
      while (true) {
        const result = await subscription.next()
        if (result.done) throw new Error('Entrypoints subscription ended')
        const value = result.value.value
        if (
          'development' in value &&
          value.development?.files.some(
            (file) =>
              file.sourcePath === join(next.testDir, shadowed) &&
              file.runtimePathname === '/inventory-duplicate/sitemap.xml'
          )
        ) {
          expect(
            result.value.issues.filter((issue) => issue.severity === 'error')
          ).toEqual([])
          expect('routes' in value).toBe(true)
          if ('routes' in value) {
            expect(
              value.routes.get('/inventory-duplicate/sitemap.xml')
            ).toMatchObject({
              runtimePathname: selected.runtimePathname,
            })
          }
          break
        }
      }
    } finally {
      await subscription.return()
      await next.deleteFile('app/inventory-duplicate')
    }
  })

  it('should expose final metadata URLs separately from compiler entry names', async () => {
    const subscription = project.entrypointsSubscribe()
    try {
      await waitForEntrypoints(subscription, () => true)
      await next.patchFile(
        'app/inventory-metadata/sitemap.ts',
        'export default function sitemap() { return [] }'
      )
      let entrypoints = await waitForEntrypoints(subscription, (value) =>
        value.routes.has('/inventory-metadata/sitemap.xml')
      )
      expect(
        entrypoints.routes.get('/inventory-metadata/sitemap.xml')
      ).toMatchObject({
        type: 'app-route',
        originalName: '/inventory-metadata/sitemap.xml/route',
        runtimePage: '/inventory-metadata/sitemap.xml/route',
        runtimePathname: '/inventory-metadata/sitemap.xml',
      })

      await next.patchFile(
        'app/inventory-metadata/sitemap.ts',
        `export function generateSitemaps() { return [{ id: 0 }] }
         export default function sitemap() { return [] }`
      )
      entrypoints = await waitForEntrypoints(subscription, (value) => {
        const route = value.routes.get('/inventory-metadata/sitemap.xml')
        return (
          route?.type === 'app-route' &&
          route.runtimePathname ===
            '/inventory-metadata/sitemap/[__metadata_id__]'
        )
      })
      expect(
        entrypoints.routes.get('/inventory-metadata/sitemap.xml')
      ).toMatchObject({
        originalName: '/inventory-metadata/sitemap.xml/route',
        runtimePage: '/inventory-metadata/sitemap/[__metadata_id__]/route',
      })
      expect(entrypoints.development?.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'app-metadata',
            sourcePath: join(next.testDir, 'app/inventory-metadata/sitemap.ts'),
            runtimePathname: '/inventory-metadata/sitemap/[__metadata_id__]',
          }),
        ])
      )

      await next.patchFile(
        'app/inventory-metadata/icon.svg',
        '<svg width="1" height="1" xmlns="http://www.w3.org/2000/svg" />'
      )
      entrypoints = await waitForEntrypoints(subscription, (value) =>
        Array.from(value.routes.values()).some(
          (route) =>
            route.type === 'app-route' &&
            route.staticMetadataSource ===
              join(next.testDir, 'app/inventory-metadata/icon.svg')
        )
      )
      const icon = Array.from(entrypoints.routes.values()).find(
        (route) =>
          route.type === 'app-route' &&
          route.staticMetadataSource ===
            join(next.testDir, 'app/inventory-metadata/icon.svg')
      )
      expect(icon).toMatchObject({ type: 'app-route' })
    } finally {
      await subscription.return()
      await next.deleteFile('app/inventory-metadata')
    }
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
      if (!('routes' in entrypoints.value)) {
        throw new Error('Entrypoints not available due to compilation errors')
      }

      const route = entrypoints.value.routes.get(path)
      entrypointsSubscribtion.return()

      expect(route.type).toBe(type)

      switch (route.type) {
        case 'page-api':
        case 'app-route': {
          const result = await route.endpoint.writeToDisk()
          expect(result.value.type).toBe(runtime)
          expect(result.value.config).toEqual(config)
          expect(normalizeIssues(result.issues)).toMatchSnapshot('issues')
          break
        }
        case 'page': {
          const result = await route.htmlEndpoint.writeToDisk()
          expect(result.value.type).toBe(runtime)
          expect(result.value.config).toEqual(config)
          expect(normalizeIssues(result.issues)).toMatchSnapshot('issues')

          const result2 = await route.dataEndpoint.writeToDisk()
          expect(result2.value.type).toBe(runtime)
          expect(result2.value.config).toEqual(config)
          expect(normalizeIssues(result2.issues)).toMatchSnapshot('data issues')
          break
        }
        case 'app-page': {
          const result = await route.pages[0].htmlEndpoint.writeToDisk()
          expect(result.value.type).toBe(runtime)
          expect(result.value.config).toEqual(config)
          expect(normalizeIssues(result.issues)).toMatchSnapshot('issues')

          const result2 = await route.pages[0].rscHmrEndpoint.writeToDisk()
          expect(result2.value.type).toBe(runtime)
          expect(result2.value.config).toEqual(config)
          expect(normalizeIssues(result2.issues)).toMatchSnapshot('rsc issues')

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
        if (!('routes' in entrypoints.value)) {
          throw new Error('Entrypoints not available due to compilation errors')
        }

        const route = entrypoints.value.routes.get(path)
        entrypointsSubscribtion.return()

        expect(route.type).toBe(type)

        let serverSideSubscription:
          | AsyncIterableIterator<TurbopackResult<void>>
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
              await route.pages[0].rscHmrEndpoint.serverChanged(false)
            break
          }
          default: {
            throw new Error('unknown route type')
          }
        }

        const result = await project.clientHmrChunkNamesSubscribe().next()
        expect(result.done).toBe(false)
        const chunkNames = result.value.value.chunkNames
        expect(chunkNames).toHaveProperty('length', expect.toBePositive())

        const subscriptions = chunkNames.map((chunkName) =>
          project.clientHmrEvents(chunkName)
        )
        await Promise.all(
          subscriptions.map(async (subscription) => {
            const result = await subscription.next()
            expect(result.done).toBe(false)
            expect(result.value.value).toHaveProperty(
              'resource',
              expect.toBeObject()
            )
            expect(result.value.value).toHaveProperty('type', 'issues')
            expect(normalizeIssues(result.value.issues)).toEqual([])
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
                  if (item.value.type === 'partial') {
                    expect(item.value.instruction).toEqual({
                      type: 'ChunkListUpdate',
                      merged: [
                        expect.objectContaining({
                          chunks: expect.toBeObject(),
                          entries: expect.toBeObject(),
                        }),
                      ],
                    })
                    const updates = Object.keys(
                      item.value.instruction.merged[0].entries
                    )
                    expect(updates).not.toBeEmpty()

                    foundUpdates = foundUpdates || []
                    foundUpdates.push(
                      ...Object.keys(item.value.instruction.merged[0].entries)
                    )
                  }
                }
              })(),
              serverSideSubscription &&
                (async () => {
                  for await (const { issues } of serverSideSubscription) {
                    if (done) return
                    expect(issues).toBeArray()
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
    if (!('routes' in entrypoints.value)) {
      throw new Error('Entrypoints not available due to compilation errors')
    }

    const route = entrypoints.value.routes.get('/')
    entrypointsSubscribtion.return()

    if (route.type !== 'page') throw new Error('unknown route type')
    await route.htmlEndpoint.writeToDisk()

    const result = await project.clientHmrChunkNamesSubscribe().next()
    expect(result.done).toBe(false)
    const chunkNames = result.value.value.chunkNames

    const subscriptions = chunkNames.map((chunkName) =>
      project.clientHmrEvents(chunkName)
    )
    await Promise.all(
      subscriptions.map(async (subscription) => {
        const result = await subscription.next()
        expect(result.done).toBe(false)
        expect(result.value.value).toHaveProperty(
          'resource',
          expect.toBeObject()
        )
        expect(result.value.value).toHaveProperty('type', 'issues')
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
        if (value.value.type === 'partial') {
          break
        }
      }
    }
  }, 300000)
})
