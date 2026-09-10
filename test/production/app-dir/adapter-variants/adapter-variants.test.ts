import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'
import {
  serializeDynamicRoutes,
  type AdapterRouting,
} from '../adapter-dynamic-routes/dynamic-routes-snapshot'

type BuildCompleteContext = Parameters<NextAdapter['onBuildComplete']>[0]

/**
 * The context, with the routing entries narrowed to the shape the snapshot
 * helper takes.
 *
 * `source` and `destination` are optional on the public `Route` type, which
 * covers every kind of routing entry. The builder gives a dynamic route both,
 * so `serializeDynamicRoutes` requires them.
 */
type SnapshottableContext = BuildCompleteContext & {
  routing: AdapterRouting
}

/**
 * The routing table a deployment resolves against is built from the adapter
 * context, and the variants suites do not read it: they assert on Next.js own
 * manifests, which hold neither the prefix-translation entries nor the gates,
 * and a deployed build runs the real adapter on a remote machine. An entry that
 * is emitted more than once therefore rides in the table of every request and
 * changes no behaviour, so nothing fails and nobody sees it. This suite reads
 * the context directly instead.
 */
describe('adapter-variants', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // The builds below are driven by hand, because each one needs its own
    // combination count.
    skipStart: true,
  })

  // Three builds run in one hook, and the default timeout of this suite covers
  // one. A build that is cut off part way leaves the child process behind, and
  // the retry then fails on a server that is already started, which reports as
  // a flake somewhere else entirely.
  jest.setTimeout(360_000)

  // Same fixture, same variant keys, and a different number of enumerated
  // combinations. See `combinations.ts`.
  let twoCombinations: BuildCompleteContext
  let fourCombinations: BuildCompleteContext

  // The same fixture again, with `experimental.collapseAdapterRoutes` on.
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

  function countByEntry(context: BuildCompleteContext) {
    const counts = new Map<string, number>()

    for (const route of context.routing.dynamicRoutes) {
      const key = JSON.stringify(route)

      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    return counts
  }

  it('should emit each routing entry once', () => {
    // Routing takes the first match, so a repeated entry can never answer a
    // request. Every copy after the first is carried in the table of every
    // deployment and reached by nothing.
    for (const context of [twoCombinations, fourCombinations]) {
      const repeated = Array.from(countByEntry(context))
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ count, route: JSON.parse(key) }))

      expect(repeated).toEqual([])
    }
  })

  it('should emit the same routing entries whatever a route declares', () => {
    // What a route contributes to the routing table describes the route, and
    // not what the build wrote for it. A prefetch segment route is derived from
    // the route pattern, and a prefix-translation entry matches any combination
    // through a capture group, so neither depends on the number of
    // combinations. Therefore doubling that number must leave the table
    // untouched.
    //
    // It did not. Each combination used to add one more copy of the segment
    // route of its route, so the table grew with the number of combinations a
    // project declared.
    //
    // The entries are compared with their multiplicity, and not as a set of
    // distinct entries. A set hides exactly the growth under test, because the
    // copies are identical.
    const entriesOf = (context: BuildCompleteContext) =>
      context.routing.dynamicRoutes.map((route) => JSON.stringify(route)).sort()

    expect(entriesOf(fourCombinations)).toEqual(entriesOf(twoCombinations))
  })

  function prerendersByCombination(
    context: BuildCompleteContext,
    route: string
  ) {
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
    // The counterpart of the assertion above, and the reason that one is not
    // merely a count of outputs. The artifacts do shard per combination,
    // because each combination bakes different values and is fetched under its
    // own key. Only the routing entries are shared, and a fix that removed a
    // routing entry by dropping a combination would pass that assertion and
    // fail this one.
    //
    // Two and four are what the fixture enumerates. The extra group in each
    // case is the combination-agnostic output, which answers a request that
    // resolved no combination.
    const two = prerendersByCombination(twoCombinations, '/concrete')
    const four = prerendersByCombination(fourCombinations, '/concrete')

    expect(two.size).toBe(1 + 2)
    expect(four.size).toBe(1 + 4)

    // Every combination is prerendered against the same outputs, so an artifact
    // missing for one of them shows up here as an uneven group.
    const sizes = new Set(
      [...two.values(), ...four.values()].map((pathnames) => pathnames.length)
    )

    expect(Array.from(sizes)).toHaveLength(1)
  })

  it('should serve every form of a prefixed request from one entry when the collapse is on', () => {
    // `experimental.collapseAdapterRoutes` merges the entry for the `.rsc`
    // payload into the entry for the page, by giving the suffix group an empty
    // final alternative. The prefixed entries of a variant route merge on the
    // same terms, so a project that declares combinations gets the collapse for
    // them too.
    //
    // Without this the prefixed pair stayed as two entries while the plain pair
    // merged, so variants was the one feature that did not follow the option.
    expect(serializeDynamicRoutes(collapsed.routing.dynamicRoutes))
      .toMatchInlineSnapshot(`
     "3 entries

     /dynamic/[slug]
       ^[/]?/dynamic/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /dynamic/[slug]$rscSuffix?nxtPslug=$nxtPslug

     /dynamic/[slug]
       ^[/]?/__variants/(?<nxtV>[^/]+)/dynamic/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /__variants/$nxtV/dynamic/[slug]$rscSuffix?nxtPslug=$nxtPslug&nxtV=$nxtV

     /concrete
       ^[/]?/__variants/(?<nxtV>[^/]+)/concrete(?:/)?$
       -> /concrete?nxtV=$nxtV"
    `)
  })

  it('should write the same prerenders whether the collapse is on or off', () => {
    // The option rewrites the routing table and nothing else. The artifacts and
    // their paths carry the per-combination cache keys, so a collapse that
    // reached them would change what a request is served rather than how it is
    // matched.
    const pathnamesOf = (context: BuildCompleteContext) =>
      context.outputs.prerenders.map((prerender) => prerender.pathname).sort()

    expect(pathnamesOf(collapsed)).toEqual(pathnamesOf(fourCombinations))
  })
})
