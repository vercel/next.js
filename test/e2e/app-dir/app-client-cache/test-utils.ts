import { Playwright } from 'next-webdriver'

export const getPathname = (url: string) => {
  const urlObj = new URL(url)
  return urlObj.pathname
}

export const browserConfigWithFixedTime = {
  beforePageLoad: (page) => {
    page.addInitScript(() => {
      const startTime = new Date()
      const fixedTime = new Date('2023-04-17T00:00:00Z')

      // Override the Date constructor
      // @ts-ignore
      // eslint-disable-next-line no-native-reassign
      Date = class extends Date {
        constructor() {
          super()
          // @ts-ignore
          return new startTime.constructor(fixedTime)
        }

        static now() {
          return fixedTime.getTime()
        }
      }
    })
  },
}

export const fastForwardTo = (ms) => {
  // Increment the fixed time by the specified duration
  const currentTime = new Date()
  currentTime.setTime(currentTime.getTime() + ms)

  // Update the Date constructor to use the new fixed time
  // @ts-ignore
  // eslint-disable-next-line no-native-reassign
  Date = class extends Date {
    constructor() {
      super()
      // @ts-ignore
      return new currentTime.constructor(currentTime)
    }

    static now() {
      return currentTime.getTime()
    }
  }
}

export const createRequestsListener = async (browser: Playwright) => {
  // wait for network idle
  await browser.waitForIdleNetwork()

  let requests = []

  browser.on('request', (req) => {
    requests.push([req.url(), !!req.headers()['next-router-prefetch']])
  })

  await browser.refresh()

  return {
    getRequests: () => requests,
    clearRequests: () => {
      requests = []
    },
  }
}
