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

const options = (mode: string) => ({
  files: {
    app: new FileRef(path.join(__dirname, 'app')),
    pages: new FileRef(path.join(__dirname, 'pages')),
    'next.config.js': process.env.IS_TURBOPACK_TEST
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
describe.each(process.env.IS_TURBOPACK_TEST ? ['turbo'] : ['strict', true])(
  'css-order %s',
  (mode: string) => {
    const { next, isNextDev, skipped } = nextTestSetup(options(mode))
    if (skipped) return
    for (const ordering of allPairs) {
      const name = `should load correct styles navigating back again ${ordering.join(
        ' -> '
      )} -> ${ordering.join(' -> ')}`
      if (
        ordering
          .map((page) => PAGES[page])
          .some((page) =>
            mode === 'turbo'
              ? page.conflictTurbo || page.conflict
              : page.conflict
          )
      ) {
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
describe.each(process.env.IS_TURBOPACK_TEST ? ['turbo'] : ['strict', 'loose'])(
  'css-order %s',
  (mode: string) => {
    const { next, isNextDev } = nextTestSetup(options(mode))
    for (const ordering of allPairs) {
      const name = `should load correct styles navigating ${ordering.join(
        ' -> '
      )}`
      if (
        ordering
          .map((page) => PAGES[page])
          .some((page) =>
            mode === 'turbo'
              ? page.conflictTurbo || page.conflict
              : page.conflict
          )
      ) {
        // Conflict scenarios won't support that case
        continue
      }
      // TODO fix this case
      let broken = ordering.some(
        (page) =>
          PAGES[page].brokenLoading ||
          (isNextDev && PAGES[page].brokenLoadingDev)
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
  }
)
describe.each(process.env.IS_TURBOPACK_TEST ? ['turbo'] : ['strict', 'loose'])(
  'css-order %s',
  (mode: string) => {
    const { next, isNextDev } = nextTestSetup(options(mode))
    for (const [page, pageInfo] of Object.entries(PAGES)) {
      const name = `should load correct styles on ${page}`
      if (
        (mode !== 'strict' && pageInfo.conflict) ||
        (mode === 'turbo' && pageInfo.conflictTurbo)
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
          expect(files).toHaveLength(
            mode === 'turbo' || mode === 'loose'
              ? pageInfo.requestsLoose || pageInfo.requests
              : pageInfo.requests
          )
        }
        await browser.close()
      })
    }
  }
)
