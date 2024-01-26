import { createNextDescribe } from 'e2e-utils'

function permute(all) {
  const result = []

  for (const first of all) {
    result.push([first])
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
}

const allOrders = permute(Object.keys(PAGES))

createNextDescribe(
  'css-order',
  {
    files: __dirname,
  },
  ({ next }) => {
    for (const ordering of allOrders) {
      it(`should load correct styles when opening pages in this order: ${ordering.join(
        ' -> '
      )}`, async () => {
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
  }
)
