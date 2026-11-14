/* eslint-env jest */
import {
  createStaticSiblingsIndex,
  getStaticSiblingsByParentUrl,
  getStaticSiblingSegments,
} from 'next/dist/build/static-siblings-index'
import { normalizeAppPath } from 'next/dist/shared/lib/router/utils/app-paths'

const isDynamicSegment = (segment: string) =>
  segment.startsWith('[') && segment.endsWith(']')

/**
 * Reference implementation: the scan `next-app-loader` used to perform over
 * every app route for each dynamic segment.
 */
function referenceStaticSiblings(
  allNormalizedAppPaths: readonly string[],
  segmentPath: string
): string[] {
  const currentUrlPath = normalizeAppPath(segmentPath + '/page')
  const currentUrlSegments = currentUrlPath.split('/').filter(Boolean)
  if (currentUrlSegments.length === 0) return []
  const currentSegment = currentUrlSegments[currentUrlSegments.length - 1]
  const parentUrlPath =
    currentUrlSegments.length === 1
      ? '/'
      : '/' + currentUrlSegments.slice(0, -1).join('/')
  const siblingLevel = currentUrlSegments.length - 1
  if (!isDynamicSegment(currentSegment)) return []
  const siblings = new Set<string>()
  for (const appPath of allNormalizedAppPaths) {
    const urlSegments = normalizeAppPath(appPath).split('/').filter(Boolean)
    if (urlSegments.length <= siblingLevel) continue
    const pathParent =
      siblingLevel === 0
        ? '/'
        : '/' + urlSegments.slice(0, siblingLevel).join('/')
    if (pathParent !== parentUrlPath) continue
    const segmentAtLevel = urlSegments[siblingLevel]
    if (
      segmentAtLevel !== currentSegment &&
      !isDynamicSegment(segmentAtLevel)
    ) {
      siblings.add(segmentAtLevel)
    }
  }
  return Array.from(siblings)
}

/** Every file-system prefix of an app path, as the loader may query it. */
function segmentPathPrefixes(appPath: string): string[] {
  const parts = appPath.split('/')
  const prefixes: string[] = []
  for (let i = 0; i <= parts.length; i++) {
    prefixes.push(parts.slice(0, i).join('/'))
  }
  return prefixes
}

// Shaped like `appPathsPerRoute` in `createEntrypoints`: normalized route ->
// file-system app paths that render it.
const appPathsPerRoute: Record<string, string[]> = {
  '/': ['/page'],
  '/products/sale': ['/(group1)/products/sale/page'],
  '/products/[id]': ['/(shop)/products/[id]/page'],
  '/products/new': ['/products/new/page'],
  '/items/featured': ['/items/featured/page'],
  '/items/[...slug]': ['/items/[...slug]/page'],
  '/docs/[[...path]]': ['/docs/[[...path]]/page'],
  '/docs/intro': ['/docs/intro/page'],
  '/categories/electronics/computers/laptops': [
    '/categories/electronics/computers/laptops/page',
  ],
  '/categories/[category]/[sub]/[leaf]': [
    '/categories/[category]/[sub]/[leaf]/page',
  ],
  '/categories/[category]': ['/categories/[category]/page'],
  '/categories/featured': ['/categories/featured/page'],
  '/dashboard': ['/dashboard/@panel/page', '/dashboard/page'],
  '/dashboard/settings': [
    '/dashboard/@panel/settings/page',
    '/dashboard/settings/page',
  ],
  '/dashboard/[tab]': ['/dashboard/@panel/[tab]/page', '/dashboard/[tab]/page'],
  '/[lang]': ['/[lang]/page'],
  '/[lang]/about': ['/[lang]/about/page'],
  '/feed/(.)photo/[id]': ['/feed/(.)photo/[id]/page'],
  '/feed/photo/[id]': ['/feed/photo/[id]/page'],
  '/feed/photo/latest': ['/feed/photo/latest/page'],
  '/api/[id]': ['/api/[id]/route'],
  '/api/health': ['/api/health/route'],
}

describe('static siblings index', () => {
  const allNormalizedAppPaths = Object.keys(appPathsPerRoute)
  const index = createStaticSiblingsIndex(allNormalizedAppPaths)

  for (const [route, appPaths] of Object.entries(appPathsPerRoute)) {
    it(`matches the reference scan for every segment of ${route}`, () => {
      const byParentUrl = getStaticSiblingsByParentUrl(index, appPaths)
      for (const appPath of appPaths) {
        for (const segmentPath of segmentPathPrefixes(appPath)) {
          expect([
            segmentPath,
            getStaticSiblingSegments(byParentUrl, segmentPath),
          ]).toEqual([
            segmentPath,
            referenceStaticSiblings(allNormalizedAppPaths, segmentPath),
          ])
        }
      }
    })
  }

  it('finds siblings across route groups', () => {
    const byParentUrl = getStaticSiblingsByParentUrl(index, [
      '/(shop)/products/[id]/page',
    ])
    expect(
      getStaticSiblingSegments(byParentUrl, '/(shop)/products/[id]')
    ).toEqual(['sale', 'new'])
  })

  it('only passes parents of dynamic segments of the entry', () => {
    expect(
      getStaticSiblingsByParentUrl(index, [
        '/categories/[category]/[sub]/[leaf]/page',
      ])
    ).toEqual({
      '/categories': ['electronics', 'featured'],
      '/categories/[category]': [],
      '/categories/[category]/[sub]': [],
    })
  })

  it('passes nothing for routes without dynamic segments', () => {
    expect(
      getStaticSiblingsByParentUrl(index, [
        '/dashboard/@panel/settings/page',
        '/dashboard/settings/page',
      ])
    ).toEqual({})
  })

  it('returns no siblings when the index is not available (dev)', () => {
    expect(getStaticSiblingSegments(null, '/(shop)/products/[id]')).toEqual([])
  })

  it('keeps per-entry data independent of the total number of routes', () => {
    const many = Array.from({ length: 2000 }, (_, i) => `/page${i}/static`)
    const manyIndex = createStaticSiblingsIndex(many)
    expect(
      getStaticSiblingsByParentUrl(manyIndex, ['/page1/static/page'])
    ).toEqual({})
  })
})
