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

  it('should leave prerenders unchanged by the collapse', () => {
    // This option changes routing only. It must not merge or remove the
    // per-combination prerender outputs themselves.
    const pathnamesOf = (context: BuildCompleteContext) =>
      context.outputs.prerenders.map((prerender) => prerender.pathname).sort()

    expect(pathnamesOf(collapsed)).toEqual(pathnamesOf(fourCombinations))
  })
})
