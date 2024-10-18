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
    brokenLoading?: boolean
    brokenLoadingDev?: boolean
    brokenLoadingTurbo?: boolean
  }
> = {
  first: {
    group: 'basic',
    url: '/first',
    selector: '#hello1',
    color: 'rgb(0, 0, 255)',
  },
  second: {
    group: 'basic',
    url: '/second',
    selector: '#hello2',
    color: 'rgb(0, 128, 0)',
  },
  third: {
    group: 'basic',
    url: '/third',
    selector: '#hello3',
    color: 'rgb(0, 128, 128)',
  },
  'first-client': {
    group: 'basic',
    url: '/first-client',
    selector: '#hello1c',
    color: 'rgb(255, 0, 255)',
  },
  'second-client': {
    group: 'basic',
    url: '/second-client',
    selector: '#hello2c',
    color: 'rgb(255, 128, 0)',
  },
  'interleaved-a': {
    group: 'interleaved',
    url: '/interleaved/a',
    selector: '#helloia',
    color: 'rgb(0, 255, 0)',
  },
  'interleaved-b': {
    group: 'interleaved',
    url: '/interleaved/b',
    selector: '#helloib',
    color: 'rgb(255, 0, 255)',
  },
  'big-interleaved-a': {
    group: 'big-interleaved',
    // TODO fix this case
    brokenLoading: true,
    url: '/big-interleaved/a',
    selector: '#hellobia',
    color: 'rgb(166, 255, 0)',
  },
  'big-interleaved-b': {
    group: 'big-interleaved',
    // TODO fix this case
    brokenLoading: true,
    url: '/big-interleaved/b',
    selector: '#hellobib',
    color: 'rgb(166, 0, 255)',
  },
  'reversed-a': {
    group: 'reversed',
    conflict: true,
    url: '/reversed/a',
    selector: '#hellora',
    color: 'rgb(0, 166, 255)',
  },
  'reversed-b': {
    group: 'reversed',
    conflict: true,
    url: '/reversed/b',
    selector: '#hellorb',
    color: 'rgb(0, 89, 255)',
  },
  'partial-reversed-a': {
    group: 'partial-reversed',
    conflict: true,
    url: '/partial-reversed/a',
    selector: '#hellopra',
    color: 'rgb(255, 166, 255)',
    background: 'rgba(0, 0, 0, 0)',
  },
  'partial-reversed-b': {
    group: 'partial-reversed',
    conflict: true,
    url: '/partial-reversed/b',
    selector: '#helloprb',
    color: 'rgb(255, 55, 255)',
    background: 'rgba(0, 0, 0, 0)',
  },
  'pages-first': {
    group: 'pages-basic',
    url: '/pages/first',
    selector: '#hello1',
    color: 'rgb(0, 0, 255)',
  },
  'pages-second': {
    group: 'pages-basic',
    url: '/pages/second',
    selector: '#hello2',
    color: 'rgb(0, 128, 0)',
  },
  'pages-third': {
    group: 'pages-basic',
    url: '/pages/third',
    selector: '#hello3',
    color: 'rgb(0, 128, 128)',
  },
  'pages-interleaved-a': {
    group: 'pages-interleaved',
    brokenLoadingDev: true,
    brokenLoadingTurbo: true,
    url: '/pages/interleaved/a',
    selector: '#helloia',
    color: 'rgb(0, 255, 0)',
  },
  'pages-interleaved-b': {
    group: 'pages-interleaved',
    brokenLoadingDev: true,
    brokenLoadingTurbo: true,
    url: '/pages/interleaved/b',
    selector: '#helloib',
    color: 'rgb(255, 0, 255)',
  },
  'pages-reversed-a': {
    group: 'pages-reversed',
    brokenLoadingDev: true,
    url: '/pages/reversed/a',
    selector: '#hellora',
    color: 'rgb(0, 166, 255)',
  },
  'pages-reversed-b': {
    group: 'pages-reversed',
    brokenLoadingDev: true,
    url: '/pages/reversed/b',
    selector: '#hellorb',
    color: 'rgb(0, 89, 255)',
  },
  'pages-partial-reversed-a': {
    group: 'pages-partial-reversed',
    brokenLoadingDev: true,
    url: '/pages/partial-reversed/a',
    selector: '#hellopra',
    color: 'rgb(255, 166, 255)',
    background: 'rgba(0, 0, 0, 0)',
  },
  'pages-partial-reversed-b': {
    group: 'pages-partial-reversed',
    brokenLoadingDev: true,
    url: '/pages/partial-reversed/b',
    selector: '#helloprb',
    color: 'rgb(255, 55, 255)',
    background: 'rgba(0, 0, 0, 0)',
  },
  'global-first': {
    group: 'global',
    conflict: true,
    url: '/global-first',
    selector: '#hello1',
    color: 'rgb(0, 255, 0)',
  },
  'global-second': {
    group: 'global',
    conflict: true,
    url: '/global-second',
    selector: '#hello2',
    color: 'rgb(0, 0, 255)',
  },
  vendor: {
    group: 'vendor',
    url: '/vendor',
    selector: '#vendor1',
    color: 'rgb(0, 255, 0)',
  },
}

const SIDE_EFFECTS_PAGES: Record<
  string,
  {
    url: string
    selector: string
    color: string
    background?: string
    skip?: Array<'turbo' | 'loose' | 'strict'>
  }
> = {
  'vendor-side-effects-array': {
    url: '/vendor/a',
    selector: '#vendor-side-effects-array',
    background: 'rgb(0, 254, 0)',
    color: 'rgb(254, 0, 0)',
    /**
     * TURBOPACK: This should be supported by turbo but does not appear to be today,
     * because the emitted rules are not in the correct order when this is set.
     * Results are inconsistent so we cannot reliably test against without
     * removing this skip...
     */
    skip: ['turbo'],
  },
  'vendor-side-effects-array-client': {
    url: '/vendor/e',
    selector: '#vendor-side-effects-array-client',
    background: 'rgb(254, 254, 0)',
    color: 'rgb(254, 254, 0)',
    /**
     * TURBOPACK: This should be supported by turbo but does not appear to be today,
     * because the emitted rules are not in the correct order when this is set.
     * Results are inconsistent so we cannot reliably test against without
     * removing this skip...
     */
    skip: ['turbo'],
  },
  'vendor-side-effects-array-server-client': {
    url: '/vendor/f',
    selector: '#vendor-side-effects-array-server-client-subcomponent',
    background: 'rgb(0, 254, 0)',
    color: 'rgb(254, 0, 0)',
    /**
     * TURBOPACK: This should be supported by turbo but does not appear to be today,
     * because the emitted rules are not in the correct order when this is set.
     * Results are inconsistent so we cannot reliably test against without
     * removing this skip...
     */
    skip: ['turbo'],
  },
  'vendor-side-effects-true': {
    url: '/vendor/b',
    selector: '#vendor-side-effects-true',
    background: 'rgb(0, 253, 0)',
    color: 'rgb(253, 0, 0)',
  },
  'vendor-side-effects-true-client': {
    url: '/vendor/g',
    selector: '#vendor-side-effects-true-client',
    background: 'rgb(253, 253, 0)',
    color: 'rgb(253, 253, 0)',
  },
  'vendor-side-effects-true-server-client': {
    url: '/vendor/h',
    selector: '#vendor-side-effects-true-server-client-subcomponent',
    background: 'rgb(0, 253, 0)',
    color: 'rgb(253, 0, 0)',
  },
  'vendor-side-effects-false': {
    url: '/vendor/c',
    selector: '#vendor-side-effects-false',
    background: 'rgb(0, 252, 0)',
    color: 'rgb(252, 0, 0)',
    /**
     * Turbopack has buttoned up a webpack bug.
     * Packages *should* side-effect css modules, but webpack doesn't retain
     * the proper import order context of css modules in libraries within
     * node_modules when side-effects is set to true.
     * Related webpack bug: https://github.com/webpack/webpack/issues/7094
     */
    skip: ['turbo'],
  },
  'vendor-side-effects-false-client': {
    url: '/vendor/i',
    selector: '#vendor-side-effects-false-client',
    background: 'rgb(252, 252, 0)',
    color: 'rgb(252, 252, 0)',
    /**
     * Turbopack has buttoned up a webpack bug.
     * Packages *should* side-effect css modules, but webpack doesn't retain
     * the proper import order context of css modules in libraries within
     * node_modules when side-effects is set to true.
     * Related webpack bug: https://github.com/webpack/webpack/issues/7094
     */
    skip: ['turbo'],
  },
  'vendor-side-effects-false-server-client': {
    url: '/vendor/j',
    selector: '#vendor-side-effects-false-server-client-subcomponent',
    background: 'rgb(0, 253, 0)',
    color: 'rgb(253, 0, 0)',
    /**
     * Turbopack has buttoned up a webpack bug.
     * Packages *should* side-effect css modules, but webpack doesn't retain
     * the proper import order context of css modules in libraries within
     * node_modules when side-effects is set to true.
     * Related webpack bug: https://github.com/webpack/webpack/issues/7094
     */
    skip: ['turbo'],
  },
  'vendor-side-effects-global-array': {
    url: '/vendor/d',
    selector: '#vendor-side-effects-global-array',
    background: 'rgb(0, 250, 0)',
    color: 'rgb(250, 0, 0)',
    /**
     * TURBOPACK: This should be supported by turbo but does not appear to be today,
     * because the emitted rules are not in the correct order when this is set.
     * Results are inconsistent so we cannot reliably test against without
     * removing this skip...
     */
    skip: ['turbo'],
  },
  'vendor-side-effects-global-array-client': {
    url: '/vendor/k',
    selector: '#vendor-side-effects-global-array-client',
    background: 'rgb(250, 250, 0)',
    color: 'rgb(250, 250, 0)',
    /**
     * TURBOPACK: This should be supported by turbo but does not appear to be today,
     * because the emitted rules are not in the correct order when this is set.
     * Results are inconsistent so we cannot reliably test against without
     * removing this skip...
     */
    skip: ['turbo'],
  },
  'vendor-side-effects-global-array-server-client': {
    url: '/vendor/k',
    selector: '#vendor-side-effects-global-array-server-client',
    background: 'rgb(0, 250, 0)',
    color: 'rgb(250, 0, 0)',
    /**
     * TURBOPACK: This should be supported by turbo but does not appear to be today,
     * because the emitted rules are not in the correct order when this is set.
     * Results are inconsistent so we cannot reliably test against without
     * removing this skip...
     */
    skip: ['turbo'],
  },
  'pages-vendor-side-effects-array': {
    url: 'pages/vendor/a',
    selector: '#vendor-side-effects-array',
    background: 'rgb(0, 254, 0)',
    color: 'rgb(254, 0, 0)',
    /**
     * TURBOPACK: This should be supported by turbo but does not appear to be today,
     * because the emitted rules are not in the correct order when this is set.
     * Results are inconsistent so we cannot reliably test against without
     * removing this skip...
     *
     * WEBPACK: css modules are inconsistent when included as sideEffects
     * when not Boolean `true` or `false`
     */
    skip: ['turbo', 'loose', 'strict'],
  },
  'pages-vendor-side-effects-true': {
    url: 'pages/vendor/b',
    selector: '#vendor-side-effects-true',
    background: 'rgb(0, 253, 0)',
    color: 'rgb(253, 0, 0)',
  },
  'pages-vendor-side-effects-false': {
    url: 'pages/vendor/c',
    selector: '#vendor-side-effects-false',
    /**
     * with side-effects=false set in a library, global css no longer loads
     * in the correct order.
     * `background` assertions will be unstable in turbo AND webpack
     */
    // background: 'rgb(0, 252, 0),
    color: 'rgb(252, 0, 0)',
    /**
     * Turbopack has buttoned up a webpack bug.
     * Packages *should* side-effect css modules, but webpack doesn't retain
     * the proper import order context of css modules in libraries within
     * node_modules when side-effects is set to true.
     * Related webpack bug: https://github.com/webpack/webpack/issues/7094
     */
    skip: ['turbo'],
  },
  'pages-vendor-side-effects-global-array': {
    url: '/vendor/d',
    selector: '#vendor-side-effects-global-array',
    background: 'rgb(0, 250, 0)',
    color: 'rgb(250, 0, 0)',
    /**
     * TURBOPACK: This should be supported by turbo but does not appear to be today,
     * because the emitted rules are not in the correct order when this is set.
     * Results are inconsistent so we cannot reliably test against without
     * removing this skip...
     */
    skip: ['turbo'],
  },
}

const allPairs = getPairs(Object.keys(PAGES))

const options = (mode: string) => ({
  files: {
    app: new FileRef(path.join(__dirname, 'app')),
    pages: new FileRef(path.join(__dirname, 'pages')),
    'next.config.js': process.env.TURBOPACK
      ? `
            module.exports = {}`
      : `
            module.exports = {
              experimental: {
                cssChunking: ${JSON.stringify(mode)}
              }
            }`,
  },
  dependencies: {
    sass: 'latest',
  },
  skipDeployment: true,
})

describe.each(process.env.TURBOPACK ? ['turbo'] : ['strict', 'loose'])(
  'css-order %s',
  (mode: string) => {
    const { next, isNextDev, skipped } = nextTestSetup(options(mode))
    if (skipped) return
    for (const ordering of allPairs) {
      const name = `should load correct styles navigating back again ${ordering.join(
        ' -> '
      )} -> ${ordering.join(' -> ')}`
      if (ordering.some((page) => PAGES[page].conflict)) {
        // Conflict scenarios won't support that case
        continue
      }
      // TODO fix this case
      const broken =
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
describe.each(process.env.TURBOPACK ? ['turbo'] : ['strict', 'loose'])(
  'css-order %s',
  (mode: string) => {
    const { next, isNextDev } = nextTestSetup(options(mode))
    for (const ordering of allPairs) {
      const name = `should load correct styles navigating ${ordering.join(
        ' -> '
      )}`
      if (mode !== 'turbo') {
        if (ordering.some((page) => PAGES[page].conflict)) {
          // Conflict scenarios won't support that case
          continue
        }
        // TODO fix this case
        const broken = ordering.some(
          (page) =>
            PAGES[page].brokenLoading ||
            (isNextDev && PAGES[page].brokenLoadingDev)
        )
        if (broken) {
          it.todo(name)
          continue
        }
      } else {
        // TODO fix this case
        const broken = ordering.some((page) => PAGES[page].brokenLoadingTurbo)
        if (broken) {
          it.todo(name)
          continue
        }
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
        await browser.close()
      })
    }
  }
)
describe.each(process.env.TURBOPACK ? ['turbo'] : ['strict', 'loose'])(
  'css-order %s',
  (mode: string) => {
    const { next } = nextTestSetup(options(mode))
    for (const [page, pageInfo] of Object.entries(PAGES)) {
      const name = `should load correct styles on ${page}`
      if (mode === 'loose' && pageInfo.conflict) {
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
        if (pageInfo.background) {
          expect(
            await browser
              .waitForElementByCss(pageInfo.selector)
              .getComputedCss('background-color')
          ).toBe(pageInfo.background)
        }
        await browser.close()
      })
    }
  }
)

describe.each(process.env.TURBOPACK ? ['turbo'] : ['strict', 'loose'])(
  'css-order %s',
  (mode: 'turbo' | 'strict' | 'loose') => {
    const { next } = nextTestSetup(options(mode))
    for (const [page, pageInfo] of Object.entries(SIDE_EFFECTS_PAGES)) {
      const name = `should load correct styles on ${page}`
      if (pageInfo.skip?.includes(mode)) {
        // Allow skip for valid (and documented) reasons.
        continue
      }
      it(name, async () => {
        const browser = await next.browser(pageInfo.url)
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
        await browser.close()
      })
    }
  }
)
