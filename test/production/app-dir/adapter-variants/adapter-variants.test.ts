import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'
import {
  serializeDynamicRoutes,
  type AdapterRouting,
} from '../adapter-dynamic-routes/dynamic-routes-snapshot'

type BuildCompleteContext = Parameters<NextAdapter['onBuildComplete']>[0]

type SnapshottableContext = BuildCompleteContext & {
  routing: AdapterRouting
}

// These assertions inspect local production build outputs.
// @force-gate start && turbopack
describe('adapter-variants', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // The hook performs three production builds. A timeout must not orphan a
  // build process that a retry then mistakes for a running Next.js instance.
  jest.setTimeout(360_000)

  let twoCombinations: BuildCompleteContext
  let fourCombinations: BuildCompleteContext
  let collapsed: SnapshottableContext

  beforeAll(async () => {
    await next.build({ env: { VARIANT_LOCALES: '1' } })
    twoCombinations = await next.readJSON('build-complete.json')

    await next.build({ env: { VARIANT_LOCALES: '2' } })
    fourCombinations = await next.readJSON('build-complete.json')

    await next.build({
      env: { VARIANT_LOCALES: '2', COLLAPSE_ADAPTER_ROUTES: '1' },
    })
    collapsed = await next.readJSON('build-complete.json')
  })

  const countByEntry = (context: BuildCompleteContext) => {
    const counts = new Map<string, number>()

    for (const route of context.routing.dynamicRoutes) {
      const key = JSON.stringify(route)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    return counts
  }

  it('should emit every routing entry once', () => {
    // Routing takes the first match. Every identical entry after it is
    // unreachable but still increases every deployment's routing table.
    for (const context of [twoCombinations, fourCombinations, collapsed]) {
      const repeated = Array.from(countByEntry(context))
        .filter(([, count]) => count > 1)
        .map(([route, count]) => ({ count, route: JSON.parse(route) }))

      expect(repeated).toEqual([])
    }
  })

  it('should keep routing and its order independent of the combination count', () => {
    // Routing captures any combination hash. Increasing the number of hashes
    // must multiply prerenders, not routing entries.
    expect(fourCombinations.routing.dynamicRoutes).toEqual(
      twoCombinations.routing.dynamicRoutes
    )
  })

  it('should route prefixed payloads before prefixed documents', () => {
    const routes = fourCombinations.routing.dynamicRoutes.filter((route) =>
      route.sourceRegex.includes('(?<nxtV>')
    )

    expect(routes).toHaveLength(2)
    // The payload matcher also accepts segment prefetches and comes first so
    // the document's dynamic param cannot consume either suffix.
    expect(routes[0].sourceRegex).toContain('rscSuffix')
    expect(routes[0].sourceRegex).toContain('\\.segments/')
    expect(routes[1].sourceRegex).not.toContain('rscSuffix')
  })

  const prerendersByCombination = (
    context: BuildCompleteContext,
    route: string
  ) => {
    const groups = new Map<string, string[]>()

    for (const prerender of context.outputs.prerenders) {
      if (prerender.route !== route) {
        continue
      }

      const match = /^\/__variants\/([0-9a-z]+)(?:\/|$)/.exec(
        prerender.pathname
      )
      const combination = match ? match[1] : 'none'
      const pathnames = groups.get(combination)

      if (pathnames) {
        pathnames.push(prerender.pathname)
      } else {
        groups.set(combination, [prerender.pathname])
      }
    }

    return groups
  }

  it('should write one set of prerenders per combination', () => {
    const two = prerendersByCombination(twoCombinations, '/concrete')
    const four = prerendersByCombination(fourCombinations, '/concrete')

    expect(two.size).toBe(1 + 2)
    expect(four.size).toBe(1 + 4)

    // Every combination produces the same artifact forms. An uneven group
    // means one form was dropped while routing remained unchanged.
    const sizes = new Set(
      [...two.values(), ...four.values()].map((pathnames) => pathnames.length)
    )

    expect(Array.from(sizes)).toHaveLength(1)
  })

  it('should collapse every form of a prefixed request into one entry', () => {
    // The prefixed page and payload follow the same collapse as the ordinary
    // route. The prefix does not participate in the suffix group.
    expect(serializeDynamicRoutes(collapsed.routing.dynamicRoutes))
      .toMatchInlineSnapshot(`
       "2 entries

       /dynamic/[slug]
         ^(?![/]?/__variants/)[/]?/dynamic/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
         -> /dynamic/[slug]$rscSuffix?nxtPslug=$nxtPslug

       /dynamic/[slug]
         ^[/]?/__variants/(?<nxtV>[0-9a-z]+)/dynamic/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
         -> /__variants/$nxtV/dynamic/[slug]$rscSuffix?nxtPslug=$nxtPslug&nxtV=$nxtV"
      `)
  })

  it('should reject a client naming the combination before any file or rewrite', () => {
    const { beforeFiles } = fourCombinations.routing
    const rejections = beforeFiles.filter(
      (route) => route.destination === '/__variants/not-routed'
    )

    // One rule for the artifact prefix and one for each spelling of the query
    // parameter, and every one of them admits only a request the proxy marked.
    expect(rejections).toHaveLength(4)
    expect(beforeFiles.slice(0, rejections.length)).toEqual(rejections)
    for (const route of rejections) {
      expect(route.missing).toEqual([
        { type: 'header', key: 'x-next-internal-variants-prefix' },
      ])
    }

    const [prefixRule, ...queryRules] = rejections
    const prefixRegex = new RegExp(prefixRule.sourceRegex)

    // The rule matches every spelling of the prefix that decodes to the same
    // pathname, and nothing else.
    for (const pathname of [
      '/__variants/1eggkwr/concrete',
      '/%5F%5Fvariants/1eggkwr/concrete',
      '/__%76ariants/1eggkwr/concrete',
      '//__variants/1eggkwr/concrete',
      '/%2F__variants/1eggkwr/concrete',
    ]) {
      expect(pathname).toMatch(prefixRegex)
    }
    for (const pathname of ['/__variants-extra/x', '/plain/__variants/x']) {
      expect(pathname).not.toMatch(prefixRegex)
    }

    expect(queryRules.map((route) => route.has)).toEqual([
      [{ type: 'query', key: 'nxtV' }],
      [{ type: 'query', key: 'nxtPnxtV' }],
      [{ type: 'query', key: 'nxtInxtV' }],
    ])
  })

  it('should exclude the rejection pathname from every matcher and rewrite', async () => {
    const { routing } = fourCombinations
    const matchers = [
      ...routing.beforeFiles.filter(
        (route) => route.destination !== '/__variants/not-routed'
      ),
      ...routing.afterFiles,
      ...routing.fallback,
      ...routing.dynamicRoutes,
    ]

    // The fixture has a rewrite in each phase and a catch-all fallback rewrite,
    // so this covers a rewrite that would otherwise match the pathname.
    expect(matchers.length).toBeGreaterThanOrEqual(3)

    // The prefixed matchers capture a hash after the namespace, so the pathname
    // is also checked with a page path behind it.
    const pathnames = [
      '/__variants/not-routed',
      '/__variants/not-routed/',
      '/__variants/not-routed.rsc',
      '/__variants/not-routed.segments/_tree.segment.rsc',
      '/__variants/not-routed/concrete',
      '/__variants/not-routed/dynamic/x',
    ]
    const matching = matchers.flatMap((route) =>
      pathnames
        .filter((pathname) => new RegExp(route.sourceRegex).test(pathname))
        .map((pathname) => `${route.source} matches ${pathname}`)
    )

    expect(matching).toEqual([])

    // The catch-all rewrite still matches an ordinary pathname, so the
    // exclusion is what stops it above.
    const fallback = routing.fallback[0]
    expect(new RegExp(fallback.sourceRegex).test('/anything/else')).toBe(true)

    // The deployment function resolves an artifact pathname to its page through
    // the aliases in the routes manifest. Those capture a hash too, and the
    // rejection pathname must not pass for one there either.
    const manifest: {
      dynamicRoutes: Array<{
        page: string
        regex: string
        variantsPrefixed?: boolean
      }>
    } = await next.readJSON('.next/routes-manifest.json')
    const aliases = manifest.dynamicRoutes.filter(
      (route) => route.variantsPrefixed
    )

    expect(aliases.map((alias) => alias.page).sort()).toEqual([
      '/concrete',
      '/dynamic/[slug]',
    ])
    for (const alias of aliases) {
      const regex = new RegExp(alias.regex)
      const pagePath = alias.page.replace('[slug]', 'x')

      expect(regex.test(`/__variants/1eggkwr${pagePath}`)).toBe(true)
      expect(regex.test(`/__variants/not-routed${pagePath}`)).toBe(false)
    }
  })

  it('should leave prerenders unchanged by the collapse', () => {
    // This option changes routing only. It must not merge or remove the
    // per-combination prerender outputs themselves.
    const pathnamesOf = (context: BuildCompleteContext) =>
      context.outputs.prerenders.map((prerender) => prerender.pathname).sort()

    expect(pathnamesOf(collapsed)).toEqual(pathnamesOf(fourCombinations))
  })
})
