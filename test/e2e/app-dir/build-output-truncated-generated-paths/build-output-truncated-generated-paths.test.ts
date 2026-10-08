import { nextTestSetup } from 'e2e-utils'
import type { PageInfo } from 'next/dist/build/utils'

// This suite only asserts `next build` output, so it is start-mode only.
// @force-gate start
describe('build output - truncated generated paths', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
    },
  })

  beforeAll(() => next.build())

  it('marks the collapsed generated paths as static', async () => {
    expect(getTreeView(next.cliOutput)).toContain(
      `└   /blog/[...slug]
  ├ ◐ /blog/[...slug]
  ├ ○ /blog/post-1
  ├ ○ /blog/post-2
  └ ○ [+10 more paths]`
    )
  })

  it('marks duration-sorted collapsed generated paths as static', async () => {
    const routePattern = '/blog/[...slug]'
    const generatedPaths = Array.from(
      { length: 12 },
      (_, index) => `/blog/post-${index + 1}`
    )
    const childRoutes = [routePattern, ...generatedPaths]
    const parentPageInfo = createPageInfo({
      hasPostponed: true,
      ssgPageRoutes: childRoutes,
      ssgPageDurations: childRoutes.map((_, index) =>
        index === 1 ? 1_000 : 0
      ),
    })
    const pageInfos = new Map<string, PageInfo>([
      [routePattern, parentPageInfo],
      ...generatedPaths.map(
        (route) =>
          [
            route,
            createPageInfo({
              isStatic: true,
              hasPostponed: false,
              isDynamicAppRoute: false,
            }),
          ] as const
      ),
    ])
    const messages: string[] = []
    const originalLog = console.log

    try {
      console.log = (...args: unknown[]) => messages.push(args.join(' '))

      let printTreeView: typeof import('next/dist/build/utils').printTreeView
      jest.isolateModules(() => {
        printTreeView = require('next/dist/build/utils').printTreeView
      })

      await printTreeView!({ pages: [], app: [routePattern] }, pageInfos, {
        pageExtensions: ['tsx'],
        buildManifest: {} as any,
        middlewareManifest: {
          version: 3,
          sortedMiddleware: [],
          middleware: {},
          functions: {},
        },
        functionsConfigManifest: { version: 1, functions: {} },
        useStaticPages404: false,
        hasGSPAndRevalidateZero: new Set(),
      })
    } finally {
      console.log = originalLog
    }

    const output = messages.join('\n')
    expect(output).toContain(`├ ◐ ${routePattern}`)
    expect(output).toContain('└ ○ [+6 more paths]')
  })

  it('prerenders all generated paths completely and statically', async () => {
    const prerenderManifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )

    const generatedPaths = Object.fromEntries(
      Object.entries<any>(prerenderManifest.routes)
        .filter(([route]) => route.startsWith('/blog/'))
        .map(([route, { response, compute }]) => [route, { response, compute }])
    )

    expect(generatedPaths).toEqual({
      '/blog/post-1': { response: 'complete', compute: 'static' },
      '/blog/post-2': { response: 'complete', compute: 'static' },
      '/blog/post-3': { response: 'complete', compute: 'static' },
      '/blog/post-4': { response: 'complete', compute: 'static' },
      '/blog/post-5': { response: 'complete', compute: 'static' },
      '/blog/post-6': { response: 'complete', compute: 'static' },
      '/blog/post-7': { response: 'complete', compute: 'static' },
      '/blog/post-8': { response: 'complete', compute: 'static' },
      '/blog/post-9': { response: 'complete', compute: 'static' },
      '/blog/post-10': { response: 'complete', compute: 'static' },
      '/blog/post-11': { response: 'complete', compute: 'static' },
      '/blog/post-12': { response: 'complete', compute: 'static' },
    })
  })
})

function getTreeView(cliOutput: string): string {
  let foundStart = false
  const lines: string[] = []

  for (const line of cliOutput.split('\n')) {
    foundStart ||= line.startsWith('Route ')

    if (foundStart) {
      lines.push(line)
    }
  }

  return lines.join('\n').trim()
}

function createPageInfo(overrides: Partial<PageInfo>): PageInfo {
  return {
    originalAppPath: '/blog/[...slug]/page',
    isStatic: false,
    isSSG: true,
    isRoutePPREnabled: true,
    isEnsureStaticPage: true,
    ssgPageRoutes: null,
    initialCacheControl: undefined,
    pageDuration: undefined,
    ssgPageDurations: undefined,
    runtime: undefined,
    isDynamicAppRoute: true,
    ...overrides,
  }
}
