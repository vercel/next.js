import { createNextDescribe } from 'e2e-utils'

function getPairs(all) {
  const result = []

  for (const first of all) {
    for (const second of all) {
      if (first === second) {
        continue
      }
      result.push([first, second])
    }
  }

  return result
}

const PAGES = {
  first: {
    url: '/first',
    selector: '#hello1',
    color: 'rgb(0, 0, 255)',
  },
  second: {
    url: '/second',
    selector: '#hello2',
    color: 'rgb(0, 128, 0)',
  },
  third: {
    url: '/third',
    selector: '#hello3',
    color: 'rgb(0, 128, 128)',
  },
  'first-client': {
    url: '/first-client',
    selector: '#hello1c',
    color: 'rgb(255, 0, 255)',
  },
  'second-client': {
    url: '/second-client',
    selector: '#hello2c',
    color: 'rgb(255, 128, 0)',
  },
  'interleaved-a': {
    url: '/interleaved/a',
    selector: '#helloia',
    color: 'rgb(0, 255, 0)',
  },
  'interleaved-b': {
    url: '/interleaved/b',
    selector: '#helloib',
    color: 'rgb(255, 0, 255)',
  },
  'reversed-a': {
    url: '/reversed/a',
    selector: '#hellora',
    color: 'rgb(0, 166, 255)',
  },
  'reversed-b': {
    url: '/reversed/b',
    selector: '#hellorb',
    color: 'rgb(0, 89, 255)',
  },
}

const allPairs = getPairs(
  Object.keys(PAGES).filter((page) => !page.startsWith('reversed'))
)

createNextDescribe(
  'css-order',
  {
    files: __dirname,
    dependencies: {
      sass: 'latest',
    },
  },
  ({ next, isNextDev, isTurbopack }) => {
    for (const ordering of allPairs) {
      const name = `should load correct styles navigating back again ${ordering.join(
        ' -> '
      )} -> ${ordering.join(' -> ')}`
      // TODO fix this case
      const broken = isNextDev && isTurbopack
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
