import path from 'path'
import { createNextDescribe, FileRef } from 'e2e-utils'

function getPairs(all) {
  const result = []

  for (const first of all) {
    for (const second of all) {
      if (first === second || PAGES[first].group !== PAGES[second].group) {
        continue
      }
      result.push([first, second])
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
    background: 'rgb(255, 255, 255)',
  },
  'partial-reversed-b': {
    group: 'partial-reversed',
    conflict: true,
    url: '/partial-reversed/b',
    selector: '#helloprb',
    color: 'rgb(255, 55, 255)',
    background: 'rgb(255, 255, 255)',
  },
}

const allPairs = getPairs(Object.keys(PAGES))

for (const mode of ['strict', 'loose'])
  createNextDescribe(
    `css-order ${mode}`,
    {
      files: {
        app: new FileRef(path.join(__dirname, 'app')),
        'next.config.js': `
        module.exports = () => {
          return {
            experimental: {
              cssChunking: ${JSON.stringify(mode)}
            }
          }
        }
      `,
      },
      dependencies: {
        sass: 'latest',
      },
    },
    ({ next, isNextDev, isTurbopack }) => {
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
          (isNextDev && isTurbopack) ||
          ordering.some((page) => PAGES[page].brokenLoading)
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
        })
      }
      for (const ordering of allPairs) {
        const name = `should load correct styles navigating ${ordering.join(
          ' -> '
        )}`
        if (ordering.some((page) => PAGES[page].conflict)) {
          // Conflict scenarios won't support that case
          continue
        }
        // TODO fix this case
        const broken = ordering.some((page) => PAGES[page].brokenLoading)
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
        })
      }
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
        })
      }
    }
  )
