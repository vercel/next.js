import crypto from 'crypto'
import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The blocking-entry cache-key contract these tests encode is implemented
// by Next.js itself (self-hosted serving and the built-in Vercel adapter).
// The LEGACY (non-adapter) Vercel builder lives in vercel/vercel and does
// not implement it yet — its blocking entries still key and bake
// never-prerenderable params — so deploy runs are limited to adapter
// deployments until that ships (see vercel/vercel#17179).
const isAdapterTest = process.env.NEXT_ENABLE_ADAPTER === '1'

type NextInstance = ReturnType<typeof nextTestSetup>['next']

// A first-principles test matrix for cache components prerendering.
//
// Every route shape the fixture can express — three generateStaticParams
// regimes × root-param placement × shell topology — is enumerated as a
// ROUTE, and each route's expected caching behavior is DERIVED from two
// facts rather than hand-written per test:
//
//   cache key     — a param may participate in cache keys iff
//                   generateStaticParams can provide it. `id` in the
//                   partial matrix and every param in the dynamic matrix
//                   are excluded; root params are always included (the
//                   build requires them to be enumerated).
//   cached region — at steady state, repeat visits serve from the cache
//                   exactly the content above the first param read that
//                   the matched entry has not resolved. Empty-shell trees
//                   collapse this to nothing (partial, dynamic) or
//                   everything (fully static); non-empty trees give
//                   everything-except-the-id-region (partial, specialized)
//                   or only the topmost loading fallback (dynamic).
//
// Two properties are asserted for every route:
//
//   DEPTH — for each distinct cache entry a request can match (one per
//   positional prefix of the enumerated params), repeat visits to one URL
//   serve exactly the expected cached region.
//   Verified by badge value identity: a value that repeats across
//   responses must come from a cached render, a value that changes proves
//   a per-request render (see readBadges).
//
//   PARTITION — prime one URL to steady state, then flip a single param to
//   a never-seen value. A param excluded from the cache key must land on
//   the SAME entry (identical badge values on the cached region; HIT on
//   deployed infra). A param included in the key must land on a DIFFERENT
//   entry (the response renders the flipped value, serves the fallback
//   entry's generic shell where one exists, and on deployed infra is
//   PRERENDER or MISS — never HIT). The partition tests
//   are also the seeding tests: sharing proves the primed traffic seeded
//   the entry other URLs consume, separation proves it seeded nothing it
//   shouldn't have.
//
// The tests are identical across self-hosted and deployed runs except for
// inline `isNextDeploy` x-vercel-cache checks where the cache key itself is
// the subject: empty entries serve zero distinguishing bytes, so entry
// sharing and separation on empty-shell trees are directly provable on
// deployed infra only.
//
// These tests encode the DESIRED behavior for all modes and infra. They
// were written against two bugs that land fixed alongside them: the
// runtime served unresolved-ROOT-param requests as per-URL baked blocking
// renders on every platform (self-hosted included), and the adapter's
// blocking prerender entries kept never-prerenderable params in
// allowQuery, keying and baking them on deployed infra. The fully-static
// and dynamic matrices pass before and after those fixes and guard them
// against over-correction. Deploy runs are adapter-only for now (see the
// `skipDeployment` note above the `isAdapterTest` declaration).

const PARAMS = ['lang', 'category', 'id'] as const
type ParamName = (typeof PARAMS)[number]
type ParamValues = Record<ParamName, string>

type StaticParams =
  | 'partial-static-param'
  | 'fully-static-param'
  | 'dynamic-param'
type RootParams = 'without-root-param' | 'with-root-param'
type Shell = 'empty-shell' | 'non-empty-shell'

type Route = {
  staticParams: StaticParams
  rootParams: RootParams
  shell: Shell
}

// The param values that generateStaticParams enumerates in each matrix.
// Enumeration is positional-prefix shaped: the partial matrix enumerates
// [en] and [en, shoes]; the fully-static matrix additionally [en, shoes, 1];
// the dynamic matrix enumerates nothing.
const PRERENDERED: Record<StaticParams, Partial<ParamValues>> = {
  'partial-static-param': { lang: 'en', category: 'shoes' },
  'fully-static-param': { lang: 'en', category: 'shoes', id: '1' },
  'dynamic-param': {},
}

// A param may participate in cache keys iff generateStaticParams can
// provide it.
function cacheKeyParams(staticParams: StaticParams): ParamName[] {
  return PARAMS.filter(
    (param) => PRERENDERED[staticParams][param] !== undefined
  )
}

// Every distinct amount of build-time prerendering a request can match:
// each positional prefix of the enumerated params identifies its own route
// entry (a request matches the entry for the longest enumerated prefix of
// its values). Because enumeration is prefix-shaped, each amount is fully
// identified by the DEEPEST param pinned to its enumerated value — null
// means nothing is pinned (the base route entry). A test row pins the
// prefix params to their enumerated values and mints unique values for
// everything else.
function prerenderedThroughValues(
  staticParams: StaticParams
): (ParamName | null)[] {
  return [null, ...cacheKeyParams(staticParams)]
}

function pinnedDepth(prerenderedThrough: ParamName | null): number {
  if (prerenderedThrough === null) {
    return 0
  }
  return PARAMS.indexOf(prerenderedThrough) + 1
}

const ROUTES: Route[] = []
for (const staticParams of [
  'partial-static-param',
  'fully-static-param',
  'dynamic-param',
] as StaticParams[]) {
  for (const rootParams of [
    'without-root-param',
    'with-root-param',
  ] as RootParams[]) {
    if (staticParams === 'dynamic-param' && rootParams === 'with-root-param') {
      // Root params must be provided by generateStaticParams (the build
      // enforces it), so this combination cannot exist — the fixture hosts
      // a tombstone page there instead of a route.
      continue
    }
    for (const shell of ['empty-shell', 'non-empty-shell'] as Shell[]) {
      ROUTES.push({ staticParams, rootParams, shell })
    }
  }
}

// 'nothing' | 'everything' | 'everything-except-id-region', or an explicit
// list of the badge names that make up the cached region.
type CachedRegion =
  | 'nothing'
  | 'everything'
  | 'everything-except-id-region'
  | string[]

function cachedRegion(route: Route): CachedRegion {
  if (route.staticParams === 'fully-static-param') {
    // Every param is prerenderable: any URL may be completed into a full
    // per-URL static prerender (classic blocking-ISR semantics), so at
    // steady state the whole document is served from the cache.
    return 'everything'
  }
  if (route.shell === 'empty-shell') {
    // Partial matrix: every entry has the never-prerenderable `id`
    // unresolved, so with no Suspense boundaries every shell is empty.
    // Dynamic matrix: the single entry resolves nothing. Either way the
    // cached entry contributes zero bytes and every response renders
    // entirely per request.
    return 'nothing'
  }
  if (route.staticParams === 'partial-static-param') {
    // At steady state the matched entry is specialized down to
    // (lang, category): the cached shell reaches the page and suspends
    // only at the id read.
    return 'everything-except-id-region'
  }
  // Dynamic matrix, non-empty tree: nothing is prerenderable, so the entry
  // can never specialize. The build-time shell suspends at the FIRST param
  // read, leaving the [lang] layout's loading fallback as the only cached
  // content.
  return ['[lang] layout (loading...)']
}

function regionLabel(region: CachedRegion): string {
  if (region === 'nothing') {
    return 'nothing'
  }
  if (region === 'everything') {
    return 'the whole document'
  }
  if (region === 'everything-except-id-region') {
    return 'everything except the [id] region'
  }
  return `only the generic shell`
}

function paramsLabel(
  staticParams: StaticParams,
  prerenderedThrough: ParamName | null
): string {
  const depth = pinnedDepth(prerenderedThrough)
  return PARAMS.map((param, index) => {
    if (index < depth) {
      return `${param}=${PRERENDERED[staticParams][param]}`
    }
    return `${param}=fresh`
  }).join(' ')
}

function uniqueValue(param: ParamName): string {
  return `${param}-${crypto.randomUUID()}`
}

function paramValuesFor(
  staticParams: StaticParams,
  prerenderedThrough: ParamName | null
): ParamValues {
  const depth = pinnedDepth(prerenderedThrough)
  const values = {} as ParamValues
  for (let index = 0; index < PARAMS.length; index++) {
    const param = PARAMS[index]
    if (index < depth) {
      const prerenderedValue = PRERENDERED[staticParams][param]
      if (prerenderedValue === undefined) {
        throw new Error(
          `params are prerendered through '${prerenderedThrough}' but ${staticParams} does not enumerate '${param}'`
        )
      }
      values[param] = prerenderedValue
    } else {
      values[param] = uniqueValue(param)
    }
  }
  return values
}

function urlFor(route: Route, values: ParamValues): string {
  return `/${route.staticParams}/${route.rootParams}/${route.shell}/${values.lang}/${values.category}/${values.id}`
}

// The badges that make up a partial-matrix non-empty shell at steady state
// (specialized down to (lang, category), suspended at the id read). The
// root layout renders the lang badge on the with-root branch; a dedicated
// [lang] layout renders it on the without-root branch.
function specializedShellBadges(route: Route, values: ParamValues): string[] {
  let langBadge: string
  if (route.rootParams === 'with-root-param') {
    langBadge = `root layout (${values.lang})`
  } else {
    langBadge = `[lang] layout (${values.lang})`
  }
  return [
    langBadge,
    `[category] layout (${values.category})`,
    'page shell',
    '[id] region (loading...)',
  ]
}

// For different-entry probes on non-empty trees: the mutated URL's first
// response must come from the closest matching entry — the longest
// enumerated prefix of the flipped values — whose shell suspends at the
// first unmatched param read. That read's loading fallback badge is the
// observable marker of the generic shell. Root params have no loading
// state (they vary the document itself), so a flipped URL whose first
// unmatched param is an unresolved ROOT param has no servable shell at
// all and the marker is null.
function fallbackShellMarker(
  route: Route,
  flippedValues: ParamValues
): string | null {
  if (route.shell !== 'non-empty-shell') {
    return null
  }
  let depth = 0
  for (const param of PARAMS) {
    if (PRERENDERED[route.staticParams][param] === flippedValues[param]) {
      depth += 1
    } else {
      break
    }
  }
  const firstUnresolved = PARAMS[depth]
  if (firstUnresolved === 'lang') {
    if (route.rootParams === 'with-root-param') {
      return null
    }
    return '[lang] layout (loading...)'
  }
  if (firstUnresolved === 'category') {
    return '[category] layout (loading...)'
  }
  return null
}

type CacheKeyProbe = {
  // The deepest param pinned to its build-enumerated value in the base URL
  // (null = none): selects the cache entry the probe runs against.
  prerenderedThrough: ParamName | null
  // The single param mutated to a never-seen value in the probe URL.
  mutate: ParamName
  expectation: 'same-entry' | 'different-entry'
}

function cacheKeyProbes(staticParams: StaticParams): CacheKeyProbe[] {
  if (staticParams === 'partial-static-param') {
    return [
      // `id` can never be provided by generateStaticParams, so it must be
      // excluded from the cache key of EVERY entry.
      { prerenderedThrough: null, mutate: 'id', expectation: 'same-entry' },
      { prerenderedThrough: 'lang', mutate: 'id', expectation: 'same-entry' },
      {
        prerenderedThrough: 'category',
        mutate: 'id',
        expectation: 'same-entry',
      },
      // `lang` and `category` are prerenderable, so they partition
      // entries. Each is mutated against every entry where its base value
      // is fresh; mutating an enumerated value (en -> fresh) reaches the
      // same fallback entry as a fresh -> fresh mutation against the next
      // shallower entry, so those probes are pruned as redundant.
      {
        prerenderedThrough: null,
        mutate: 'lang',
        expectation: 'different-entry',
      },
      {
        prerenderedThrough: null,
        mutate: 'category',
        expectation: 'different-entry',
      },
      {
        prerenderedThrough: 'lang',
        mutate: 'category',
        expectation: 'different-entry',
      },
    ]
  }
  if (staticParams === 'dynamic-param') {
    // No param is in the key: every param must be individually excluded,
    // and mutating any one of them must land on the route's single entry.
    return [
      { prerenderedThrough: null, mutate: 'lang', expectation: 'same-entry' },
      {
        prerenderedThrough: null,
        mutate: 'category',
        expectation: 'same-entry',
      },
      { prerenderedThrough: null, mutate: 'id', expectation: 'same-entry' },
    ]
  }
  // fully-static-param: no cache-key probes. Separation is subsumed by the
  // depth tests: every depth test proves a fully-cached document rendering
  // ITS OWN param values. If any param were wrongly excluded from the
  // cache key, the depth rows differing only in that param would share one
  // completed document, and whichever row probes the shared entry second
  // would see the other row's baked values — failing its content
  // assertions.
  return []
}

// Reads every Boundary badge in a document, as a name -> value record. The
// values are read out of the inline paint scripts (see
// components/boundary.tsx). Only the REAL scripts match: the flight
// (hydration) payload embeds quote-escaped copies of the same scripts with
// per-request values, and those don't match this pattern — so the values
// here are exactly what the server served as HTML.
//
// Badge values are performance.now() readings taken when the badge
// rendered: a value that REPEATS across responses must have been served
// from a cache (two distinct renders essentially never produce the same
// sub-microsecond reading — and within one server instance a later render
// always reads strictly higher), while a value that CHANGES proves a fresh
// per-request render.
function readBadges(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re =
    /data-badge="([^"]+)"[\s\S]*?setAttribute\('data-value',"([\d.]+)"\)/g
  let match
  while ((match = re.exec(body))) {
    if (!(match[1] in out)) {
      out[match[1]] = match[2]
    }
  }
  return out
}

// The x-vercel-cache statuses are deterministic for this fixture (deployed
// infra only; every entry is built with `revalidate: false` so nothing ever
// goes stale):
//
//   MISS      — generated blocking; no fallback was available.
//   PRERENDER — a build-time fallback was served for a never-seen cache key.
//   HIT       — served from an existing cache entry.
//
// Which one a request gets derives from whether the matched entry has a
// servable fallback (see matchedEntryHasFallback) and whether the request's
// cache key — the URL minus the params excluded from the key — has been
// seen before.
//
// Whether the entry a URL at a given prerender depth matches has a servable
// fallback file. Two things remove the fallback: the blocking downgrade (an
// empty-shell tree whose entry still has prerenderable params remaining —
// the build discards the useless empty shell), and an unresolved ROOT param
// (the document itself varies by root param, so the base entry of a
// with-root branch has nothing servable across branches).
function matchedEntryHasFallback(
  route: Route,
  prerenderedThrough: ParamName | null
): boolean {
  if (route.rootParams === 'with-root-param' && prerenderedThrough === null) {
    return false
  }
  if (
    route.shell === 'empty-shell' &&
    remainingPrerenderableBelow(route, prerenderedThrough) > 0
  ) {
    return false
  }
  return true
}

// How many prerenderable params a URL at this prerender depth leaves
// unresolved. Also identifies whether such a URL mints a fresh cache key:
// the unresolved prerenderable params are exactly the key-participating
// positions that carry a freshly-minted value.
function remainingPrerenderableBelow(
  route: Route,
  prerenderedThrough: ParamName | null
): number {
  return (
    cacheKeyParams(route.staticParams).length - pinnedDepth(prerenderedThrough)
  )
}

function createDocumentFetcher(next: NextInstance) {
  return async function fetchDocument(pathname: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)
    const body = await response.text()

    return {
      response,
      body,
      $: cheerio.load(body),
    }
  }
}

describe('cache-components-prerender-matrix', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipDeployment: !isAdapterTest,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  const fetchDocument = createDocumentFetcher(next)

  // Fetches a URL twice and, for every badge, requires the value to either
  // repeat exactly (the region was served from a cached render) or change
  // (the region was rendered per request), according to the route's cached
  // region.
  async function verifyRepeatRenderProvenance(
    pathname: string,
    id: string,
    region: CachedRegion
  ) {
    const first = await fetchDocument(pathname)
    const second = await fetchDocument(pathname)

    expect(first.$('#id').text()).toBe(id)
    expect(second.$('#id').text()).toBe(id)

    const firstBadges = readBadges(first.body)
    const secondBadges = readBadges(second.body)
    expect(Object.keys(secondBadges).sort()).toEqual(
      Object.keys(firstBadges).sort()
    )

    const idBadge = `[id] region (${id})`
    expect(firstBadges[idBadge]).toBeTruthy()

    for (const name of Object.keys(firstBadges)) {
      let mustBeFresh: boolean
      if (region === 'nothing') {
        mustBeFresh = true
      } else if (region === 'everything') {
        mustBeFresh = false
      } else if (region === 'everything-except-id-region') {
        mustBeFresh = name === idBadge
      } else {
        mustBeFresh = !region.includes(name)
      }
      if (mustBeFresh) {
        expect(`${name}: ${secondBadges[name]}`).not.toBe(
          `${name}: ${firstBadges[name]}`
        )
      } else {
        expect(`${name}: ${secondBadges[name]}`).toBe(
          `${name}: ${firstBadges[name]}`
        )
      }
    }

    return { first, second, firstBadges, secondBadges }
  }

  // Asserts that two responses were served from the same cache entry: each
  // of the named badges must be present in both documents with the exact
  // same value (equal values can only come from a shared cached render).
  function expectSameEntry(
    a: Record<string, string>,
    b: Record<string, string>,
    sharedBadges: string[]
  ) {
    for (const name of sharedBadges) {
      expect(`${name} present: ${a[name] !== undefined}`).toBe(
        `${name} present: true`
      )
      expect(`${name}: ${b[name]}`).toBe(`${name}: ${a[name]}`)
    }
  }

  // Primes a base URL to steady state: repeat visits must serve
  // the route's expected cached region before any probe runs against the
  // entry. (For non-empty partial routes this is also what drives the entry
  // to its specialized shell.)
  async function primeToSteadyState(
    pathname: string,
    id: string,
    region: CachedRegion
  ) {
    await fetchDocument(pathname)
    await retry(async () => {
      await verifyRepeatRenderProvenance(pathname, id, region)
    })
  }

  // PARTITION, sharing direction: the mutated param is excluded from the
  // cache key, so a URL differing only in it must be served from the
  // primed entry.
  async function expectServedFromSameEntry(
    route: Route,
    prerenderedThrough: ParamName | null,
    mutate: ParamName
  ) {
    const region = cachedRegion(route)
    const base = paramValuesFor(route.staticParams, prerenderedThrough)
    const basePathname = urlFor(route, base)

    await primeToSteadyState(basePathname, base.id, region)

    await retry(async () => {
      // Captured back-to-back within the attempt so entry revalidation
      // between the captures can't skew the comparison. Priming already
      // fetched this URL repeatedly, so its entry exists: HIT exactly.
      const primed = await fetchDocument(basePathname)
      if (isNextDeploy) {
        expect(primed.response.headers.get('x-vercel-cache')).toBe('HIT')
      }

      // A fresh mutated value on every attempt: if the param is wrongly
      // part of the cache key, every attempt fails — the attempt itself
      // would otherwise prime the very entry it is probing. The mutated
      // param is excluded from the cache key, so the mutated URL maps to
      // the SAME (already primed) key: HIT exactly. MISS or PRERENDER
      // would mean the mutated param partitioned the cache.
      const mutated = { ...base, [mutate]: uniqueValue(mutate) }
      const mutatedPathname = urlFor(route, mutated)
      const first = await fetchDocument(mutatedPathname)
      if (isNextDeploy) {
        expect(first.response.headers.get('x-vercel-cache')).toBe('HIT')
      }

      if (region === 'nothing') {
        // The shared entry is empty: it serves no distinguishing bytes, so
        // the deployed cache status above is the only direct sharing proof
        // (self-hosted, the provenance check below proves per-request
        // rendering only).
      } else if (region === 'everything-except-id-region') {
        expectSameEntry(
          readBadges(primed.body),
          readBadges(first.body),
          specializedShellBadges(route, base)
        )
      } else if (Array.isArray(region)) {
        expectSameEntry(readBadges(primed.body), readBadges(first.body), region)
      } else {
        throw new Error(
          `no same-entry probes exist for cached region '${region}'`
        )
      }

      // The mutated value must render as content — the shared entry never
      // resolves it.
      expect(first.$(`#${mutate}`).text()).toBe(mutated[mutate])

      await verifyRepeatRenderProvenance(mutatedPathname, mutated.id, region)
    })
  }

  // PARTITION, separation direction: the mutated param is included in the
  // cache key, so a URL differing in it must NOT be served from the primed
  // entry.
  async function expectServedFromDifferentEntry(
    route: Route,
    prerenderedThrough: ParamName | null,
    mutate: ParamName
  ) {
    const region = cachedRegion(route)
    const base = paramValuesFor(route.staticParams, prerenderedThrough)
    const basePathname = urlFor(route, base)

    await primeToSteadyState(basePathname, base.id, region)

    await retry(async () => {
      // A fresh mutated value on every attempt, so a wrongly-shared entry
      // fails every attempt.
      const mutated = { ...base, [mutate]: uniqueValue(mutate) }
      const first = await fetchDocument(urlFor(route, mutated))

      // The mutated param is in the cache key, so the mutated URL mints a
      // never-seen key and can't be served from any existing entry: the
      // matched entry's fallback serves (PRERENDER), or the request blocks
      // when no fallback exists (MISS). A HIT here would mean the entries
      // wrongly collapsed. The mutated URL matches the same entry as the
      // base (the mutation only replaces fresh values with fresh values).
      if (isNextDeploy) {
        const expectedStatus = matchedEntryHasFallback(
          route,
          prerenderedThrough
        )
          ? 'PRERENDER'
          : 'MISS'
        expect(first.response.headers.get('x-vercel-cache')).toBe(
          expectedStatus
        )
      }

      // The response must render the mutated value — a response carrying
      // the primed value would mean the entries wrongly collapsed.
      expect(first.$(`#${mutate}`).text()).toBe(mutated[mutate])
      if (mutate === 'lang' && route.rootParams === 'with-root-param') {
        // Root params vary the document itself, so a leak of another
        // lang's cached document is observable on the html tag.
        expect(first.$('html').attr('lang')).toBe(mutated.lang)
      }

      const marker = fallbackShellMarker(route, mutated)
      if (marker !== null) {
        // The first response must come from the fallback entry's generic
        // shell — marked by its loading fallback badge — never from the
        // primed entry's specialized shell.
        expect(readBadges(first.body)[marker]).toBeTruthy()
      }
    })
  }

  for (const route of ROUTES) {
    describe(`${route.staticParams}/${route.rootParams}/${route.shell}`, () => {
      const region = cachedRegion(route)

      // DEPTH: one test per matchable cache entry.
      for (const prerenderedThrough of prerenderedThroughValues(
        route.staticParams
      )) {
        const label = paramsLabel(route.staticParams, prerenderedThrough)

        it(`serves ${regionLabel(region)} from the cache at ${label}`, async () => {
          const values = paramValuesFor(route.staticParams, prerenderedThrough)
          const pathname = urlFor(route, values)

          const first = await fetchDocument(pathname)
          if (
            isNextDeploy &&
            remainingPrerenderableBelow(route, prerenderedThrough) > 0
          ) {
            // This URL mints a never-seen cache key (its unresolved
            // prerenderable params carry freshly-minted values), so the
            // very first response cannot be served from an existing entry:
            // the matched entry's fallback serves (PRERENDER), or the
            // request blocks when no fallback exists (MISS). Rows whose
            // key params are all pinned share their key with other tests,
            // so no first-response status is knowable there.
            const expectedStatus = matchedEntryHasFallback(
              route,
              prerenderedThrough
            )
              ? 'PRERENDER'
              : 'MISS'
            expect(first.response.headers.get('x-vercel-cache')).toBe(
              expectedStatus
            )
          }

          await retry(async () => {
            const repeat = await verifyRepeatRenderProvenance(
              pathname,
              values.id,
              region
            )
            if (route.rootParams === 'with-root-param') {
              // Root params vary the document itself: every response must
              // carry the requested lang on the html tag.
              expect(repeat.first.$('html').attr('lang')).toBe(values.lang)
            }
          })
        })
      }

      // PARTITION: one test per cache-key probe.
      for (const probe of cacheKeyProbes(route.staticParams)) {
        const label = paramsLabel(route.staticParams, probe.prerenderedThrough)

        if (probe.expectation === 'same-entry') {
          it(`shares the entry at ${label} with a fresh ${probe.mutate} value (${probe.mutate} excluded from the cache key)`, async () => {
            await expectServedFromSameEntry(
              route,
              probe.prerenderedThrough,
              probe.mutate
            )
          })
        } else {
          it(`does not share the entry at ${label} across ${probe.mutate} values (${probe.mutate} included in the cache key)`, async () => {
            await expectServedFromDifferentEntry(
              route,
              probe.prerenderedThrough,
              probe.mutate
            )
          })
        }
      }
    })
  }
})
