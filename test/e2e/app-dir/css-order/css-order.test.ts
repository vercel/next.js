import path from 'path'
import { nextTestSetup, FileRef } from 'e2e-utils'

function getPairs(all: string[]): (readonly [string, string])[] {
  const result: (readonly [string, string])[] = []

  for (const first of all) {
    for (const second of all) {
      if (first === second || PAGES[first].group !== PAGES[second].group) {
        continue
      }
      result.push([first, second] as const)
    }
  }

  return result
}

const PAGES: Record<
  string,
  {
    group: string
    url: string
    selector: string
    color: string
    background?: string
    conflict?: boolean
    conflictTurbo?: boolean
    brokenLoading?: boolean
    brokenLoadingDev?: boolean
    requests?: number
    requestsLoose?: number
    requestsGraph?: number
  }
> = {
  first: {
    group: 'basic',
    url: '/first',
    selector: '#hello1',
    color: 'rgb(0, 0, 255)',
    requests: 1,
  },
  second: {
    group: 'basic',
    url: '/second',
    selector: '#hello2',
    color: 'rgb(0, 128, 0)',
    requests: 1,
  },
  third: {
    group: 'basic',
    url: '/third',
    selector: '#hello3',
    color: 'rgb(0, 128, 128)',
    requests: 1,
  },
  'first-client': {
    group: 'basic',
    url: '/first-client',
    selector: '#hello1c',
    color: 'rgb(255, 0, 255)',
    requests: 1,
  },
  'second-client': {
    group: 'basic',
    url: '/second-client',
    selector: '#hello2c',
    color: 'rgb(255, 128, 0)',
    requests: 1,
  },
  'interleaved-a': {
    group: 'interleaved',
    url: '/interleaved/a',
    selector: '#helloia',
    color: 'rgb(0, 255, 0)',
    requests: 1,
  },
  'interleaved-b': {
    group: 'interleaved',
    url: '/interleaved/b',
    selector: '#helloib',
    color: 'rgb(255, 0, 255)',
    requests: 1,
  },
  'big-interleaved-a': {
    group: 'big-interleaved',
    // TODO fix this case
    brokenLoading: true,
    url: '/big-interleaved/a',
    selector: '#hellobia',
    color: 'rgb(166, 255, 0)',
    requests: 4,
  },
  'big-interleaved-b': {
    group: 'big-interleaved',
    // TODO fix this case
    brokenLoading: true,
    url: '/big-interleaved/b',
    selector: '#hellobib',
    color: 'rgb(166, 0, 255)',
    requests: 4,
  },
  'reversed-a': {
    group: 'reversed',
    conflict: true,
    url: '/reversed/a',
    selector: '#hellora',
    color: 'rgb(0, 166, 255)',
    requests: 3,
  },
  'reversed-b': {
    group: 'reversed',
    conflict: true,
    url: '/reversed/b',
    selector: '#hellorb',
    color: 'rgb(0, 89, 255)',
    requests: 3,
  },
  'partial-reversed-a': {
    group: 'partial-reversed',
    conflict: true,
    url: '/partial-reversed/a',
    selector: '#hellopra',
    color: 'rgb(255, 166, 255)',
    background: 'rgba(0, 0, 0, 0)',
    requests: 4,
  },
  'partial-reversed-b': {
    group: 'partial-reversed',
    conflict: true,
    url: '/partial-reversed/b',
    selector: '#helloprb',
    color: 'rgb(255, 55, 255)',
    background: 'rgba(0, 0, 0, 0)',
    requests: 4,
  },
  // Two pages where shared CSS modules sandwich a unique stylesheet:
  //   /sandwich/a: shared1 → uniqueA (module) → shared2
  //   /sandwich/b: shared1 → uniqueB (GLOBAL) → shared2
  // The chunker must not merge shared1 and shared2 into a single chunk because they sit on
  // either side of the unique stylesheet. uniqueB is a global stylesheet specifically so the
  // algorithm can't collapse everything into one big shared chunk: a global stylesheet must
  // never be loaded by chunk groups that don't import it (i.e. `/sandwich/a`), so uniqueB has
  // to stay isolated.
  'sandwich-a': {
    group: 'sandwich',
    url: '/sandwich/a',
    selector: '#hellosba',
    color: 'rgb(0, 0, 255)',
    // 2 requests = `shared1 + uniqueA` fused into one chunk + `shared2` separate (still shared
    // with /sandwich/b). 3 requests is a valid alternative (no overshipping; better cache reuse
    // of shared1 across pages), but strict & graph here both prefer overshipping uniqueA.
    requests: 2,
    requestsLoose: 1,
    // Same as `requests`, but spelled out so `requestsLoose` doesn't shadow it via the fallback
    // chain in `expectedRequests`.
    requestsGraph: 2,
  },
  'sandwich-b': {
    group: 'sandwich',
    url: '/sandwich/b',
    selector: '#hellosbb',
    color: 'rgb(0, 0, 255)',
    // 3 requests is forced: uniqueB is a global stylesheet so it can't fuse with the CSS
    // modules on either side. shared1 and shared2 each stay in their own chunk so they can be
    // shared with /sandwich/a.
    requests: 3,
    // TODO loose merges shared1 and shared2 into a single chunk despite uniqueB sitting
    // between them on the page; the correct value is 3 (matching `requests`).
    requestsLoose: 2,
    // Same as `requests`, but spelled out so `requestsLoose` doesn't shadow it via the fallback
    // chain in `expectedRequests`.
    requestsGraph: 3,
  },
  'pages-first': {
    group: 'pages-basic',
    url: '/pages/first',
    selector: '#hello1',
    color: 'rgb(0, 0, 255)',
    requests: 1,
  },
  'pages-second': {
    group: 'pages-basic',
    url: '/pages/second',
    selector: '#hello2',
    color: 'rgb(0, 128, 0)',
    requests: 1,
  },
  'pages-third': {
    group: 'pages-basic',
    url: '/pages/third',
    selector: '#hello3',
    color: 'rgb(0, 128, 128)',
    requests: 1,
  },

  'pages-interleaved-a': {
    group: 'pages-interleaved',
    brokenLoadingDev: true,
    url: '/pages/interleaved/a',
    selector: '#helloia',
    color: 'rgb(0, 255, 0)',
    requests: 1,
  },
  'pages-interleaved-b': {
    group: 'pages-interleaved',
    brokenLoadingDev: true,
    url: '/pages/interleaved/b',
    selector: '#helloib',
    color: 'rgb(255, 0, 255)',
    requests: 1,
  },
  'pages-reversed-a': {
    group: 'pages-reversed',
    brokenLoadingDev: true,
    // TODO Turbopack can support this case with a pages dir css chunking
    conflictTurbo: true,
    url: '/pages/reversed/a',
    selector: '#hellora',
    color: 'rgb(0, 166, 255)',
    requests: 1,
  },
  'pages-reversed-b': {
    group: 'pages-reversed',
    brokenLoadingDev: true,
    // TODO Turbopack can support this case with a pages dir css chunking
    conflictTurbo: true,
    url: '/pages/reversed/b',
    selector: '#hellorb',
    color: 'rgb(0, 89, 255)',
    requests: 1,
  },
  'pages-partial-reversed-a': {
    group: 'pages-partial-reversed',
    brokenLoadingDev: true,
    // TODO Turbopack can support this case with a pages dir css chunking
    conflictTurbo: true,
    url: '/pages/partial-reversed/a',
    selector: '#hellopra',
    color: 'rgb(255, 166, 255)',
    background: 'rgba(0, 0, 0, 0)',
    requests: 1,
  },
  'pages-partial-reversed-b': {
    group: 'pages-partial-reversed',
    brokenLoadingDev: true,
    // TODO Turbopack can support this case with a pages dir css chunking
    conflictTurbo: true,
    url: '/pages/partial-reversed/b',
    selector: '#helloprb',
    color: 'rgb(255, 55, 255)',
    background: 'rgba(0, 0, 0, 0)',
    requests: 1,
  },
  'global-first': {
    group: 'global',
    conflict: true,
    url: '/global-first',
    selector: '#hello1',
    color: 'rgb(0, 255, 0)',
    requests: 2,
  },
  'global-second': {
    group: 'global',
    conflict: true,
    url: '/global-second',
    selector: '#hello2',
    color: 'rgb(0, 0, 255)',
    requests: 2,
  },
  vendor: {
    group: 'vendor',
    url: '/vendor',
    selector: '#vendor1',
    color: 'rgb(0, 255, 0)',
    requests: 1,
  },
}

const allPairs = getPairs(Object.keys(PAGES))

// Each entry is `[label, value]`, where `label` is shown in test names and `value` is what gets
// written into `experimental.cssChunking` (or `undefined` to leave it unset, which is the
// existing Turbopack default).
type GraphCssChunkingObject = {
  type: 'graph'
  requestCost?: number
  moduleFactorCost?: number
}
type CssChunkingValue =
  | boolean
  | 'strict'
  | 'loose'
  | 'graph'
  | GraphCssChunkingObject
  | undefined

type Mode = readonly [string, CssChunkingValue]

const TURBO_MODES: readonly Mode[] = [
  ['turbo', undefined],
  ['graph', 'graph'],
  // Verifies the object form is accepted. We pass the algorithm's defaults so the chunk shape
  // matches the plain `'graph'` row, letting us reuse the same `requestsGraph` expectations.
  ['graph-object', { type: 'graph', requestCost: 20_000, moduleFactorCost: 1 }],
]
const WEBPACK_MODES_TRUE: readonly Mode[] = [
  ['strict', 'strict'],
  ['true', true],
]
const WEBPACK_MODES_LOOSE: readonly Mode[] = [
  ['strict', 'strict'],
  ['loose', 'loose'],
]

function isGraphMode(value: CssChunkingValue): boolean {
  return (
    value === 'graph' ||
    (typeof value === 'object' && value !== null && value.type === 'graph')
  )
}

function isStrictMode(value: CssChunkingValue): boolean {
  return value === 'strict'
}

const options = (value: CssChunkingValue) => ({
  files: {
    app: new FileRef(path.join(__dirname, 'app')),
    pages: new FileRef(path.join(__dirname, 'pages')),
    'next.config.js':
      value === undefined
        ? `module.exports = {}`
        : `module.exports = { experimental: { cssChunking: ${JSON.stringify(value)} } }`,
  },
  dependencies: {
    sass: 'latest',
  },
  skipDeployment: true,
})

/**
 * Number of CSS request expected for a page in the given mode. Falls back from the most-specific
 * to the most-generic per-page expectation.
 */
function expectedRequests(
  value: CssChunkingValue,
  pageInfo: {
    requests?: number
    requestsLoose?: number
    requestsGraph?: number
  }
): number | undefined {
  if (isGraphMode(value)) {
    return pageInfo.requestsGraph ?? pageInfo.requestsLoose ?? pageInfo.requests
  }
  if (isStrictMode(value)) {
    return pageInfo.requests
  }
  // `undefined` (Turbopack default), `true`, or `'loose'` all map to loose.
  return pageInfo.requestsLoose ?? pageInfo.requests
}

/**
 * Whether a given ordering should be skipped because at least one page in the ordering has a
 * conflict that the active chunking mode can't preserve. `'strict'` preserves ordering for
 * conflict scenarios; everything else does not.
 */
function shouldSkipConflict(ordering: readonly string[]): boolean {
  return ordering
    .map((page) => PAGES[page])
    .some((page) =>
      process.env.IS_TURBOPACK_TEST
        ? page.conflictTurbo || page.conflict
        : page.conflict
    )
}

describe.each(process.env.IS_TURBOPACK_TEST ? TURBO_MODES : WEBPACK_MODES_TRUE)(
  'css-order %s',
  (_label: string, value: CssChunkingValue) => {
    const { next, isNextDev, skipped } = nextTestSetup(options(value))
    if (skipped) return
    for (const ordering of allPairs) {
      const name = `should load correct styles navigating back again ${ordering.join(
        ' -> '
      )} -> ${ordering.join(' -> ')}`
      if (shouldSkipConflict(ordering)) {
        // Conflict scenarios won't support that case
        continue
      }
      // TODO fix this case
      let broken =
        isNextDev || ordering.some((page) => PAGES[page].brokenLoading)
      if (broken) {
        it.todo(name)
        continue
      }
      it(name, async () => {
        const start = PAGES[ordering[0]]
        const browser = await next.browser(start.url)
        const check = async (pageInfo) => {
          expect(
            await browser
              .waitForElementByCss(pageInfo.selector)
              .getComputedCss('color')
          ).toBe(pageInfo.color)
          if (pageInfo.background) {
            expect(
              await browser
                .waitForElementByCss(pageInfo.selector)
                .getComputedCss('background-color')
            ).toBe(pageInfo.background)
          }
        }
        const navigate = async (page) => {
          await browser.waitForElementByCss('#' + page).click()
        }
        await check(start)
        for (const page of ordering.slice(1)) {
          await navigate(page)
          await check(PAGES[page])
        }
        for (const page of ordering) {
          await navigate(page)
          await check(PAGES[page])
        }
        await browser.close()
      })
    }
  }
)
describe.each(
  process.env.IS_TURBOPACK_TEST ? TURBO_MODES : WEBPACK_MODES_LOOSE
)('css-order %s', (_label: string, value: CssChunkingValue) => {
  const { next, isNextDev } = nextTestSetup(options(value))
  for (const ordering of allPairs) {
    const name = `should load correct styles navigating ${ordering.join(
      ' -> '
    )}`
    if (shouldSkipConflict(ordering)) {
      // Conflict scenarios won't support that case
      continue
    }
    // TODO fix this case
    let broken = ordering.some(
      (page) =>
        PAGES[page].brokenLoading || (isNextDev && PAGES[page].brokenLoadingDev)
    )
    if (broken) {
      it.todo(name)
      continue
    }
    it(name, async () => {
      const start = PAGES[ordering[0]]
      const browser = await next.browser(start.url)
      const check = async (pageInfo) => {
        expect(
          await browser
            .waitForElementByCss(pageInfo.selector)
            .getComputedCss('color')
        ).toBe(pageInfo.color)
      }
      const navigate = async (page) => {
        await browser.waitForElementByCss('#' + page).click()
      }
      await check(start)
      for (const page of ordering.slice(1)) {
        await navigate(page)
        await check(PAGES[page])
      }
      await browser.close()
    })
  }
})
describe.each(
  process.env.IS_TURBOPACK_TEST ? TURBO_MODES : WEBPACK_MODES_LOOSE
)('css-order %s', (_label: string, value: CssChunkingValue) => {
  const { next, isNextDev } = nextTestSetup(options(value))
  for (const [page, pageInfo] of Object.entries(PAGES)) {
    const name = `should load correct styles on ${page}`
    if (
      // `strict` preserves ordering for conflict scenarios; loose/turbo/graph do not.
      // `conflictTurbo` applies to any Turbopack mode.
      (!isStrictMode(value) && pageInfo.conflict) ||
      (process.env.IS_TURBOPACK_TEST && pageInfo.conflictTurbo)
    ) {
      // Conflict scenarios won't support that case
      continue
    }
    it(name, async () => {
      const browser = await next.browser(pageInfo.url)
      expect(
        await browser
          .waitForElementByCss(pageInfo.selector)
          .getComputedCss('color')
      ).toBe(pageInfo.color)
      if (!isNextDev) {
        const stylesheets = await browser.elementsByCss(
          "link[rel='stylesheet']"
        )
        const files = await Promise.all(
          Array.from(stylesheets).map((e) => e.getAttribute('href'))
        )
        expect(files).toHaveLength(expectedRequests(value, pageInfo))
      }
      await browser.close()
    })
  }
})
