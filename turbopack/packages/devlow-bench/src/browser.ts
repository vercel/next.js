import type {
  Browser,
  BrowserContext,
  ConsoleMessage,
  Page,
  Request,
  Response,
} from 'playwright-chromium'
import { chromium } from 'playwright-chromium'
import { measureTime, reportMeasurement } from './index.js'

interface BrowserSession {
  close(): Promise<void>
  hardNavigation(metricName: string, url: string): Promise<Page>
  softNavigationByClick(metricName: string, selector: string): Promise<void>
  reload(metricName: string): Promise<void>
}

const browserOutput = Boolean(process.env.BROWSER_OUTPUT)

async function withRequestMetrics(
  metricName: string,
  page: Page,
  fn: () => Promise<void>
): Promise<void> {
  const activePromises: Array<Promise<void>> = []
  const sizeByExtension = new Map<string, number>()
  const requestsByExtension = new Map<string, number>()
  const responseHandler = (response: Response) => {
    activePromises.push(
      (async () => {
        const url = response.request().url()
        const status = response.status()
        const extension =
          /^[^?#]+\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1] ?? 'none'
        const currentRequests = requestsByExtension.get(extension) ?? 0
        requestsByExtension.set(extension, currentRequests + 1)
        if (status >= 200 && status < 300) {
          let body
          try {
            body = await response.body()
          } catch {
            // empty
          }
          if (body) {
            const size = body.length
            const current = sizeByExtension.get(extension) ?? 0
            sizeByExtension.set(extension, current + size)
          }
        }
      })()
    )
  }
  let errorCount = 0
  let warningCount = 0
  let logCount = 0
  const consoleHandler = (message: ConsoleMessage) => {
    const type = message.type()
    if (type === 'error') {
      errorCount++
    } else if (type === 'warning') {
      warningCount++
    } else {
      logCount++
    }
    if (browserOutput) {
      activePromises.push(
        (async () => {
          const args = []
          try {
            const text = message.text()
            for (const arg of message.args()) {
              args.push(await arg.jsonValue())
            }
            console.log(`[${type}] ${text}`, ...args)
          } catch {
            // Ignore
          }
        })()
      )
    }
  }
  let uncaughtCount = 0
  const exceptionHandler = (error: Error) => {
    uncaughtCount++
    if (browserOutput) {
      console.error(`[UNCAUGHT]`, error)
    }
  }
  try {
    page.on('response', responseHandler)
    page.on('console', consoleHandler)
    page.on('pageerror', exceptionHandler)
    await fn()
    await Promise.all(activePromises)
    let totalDownload = 0
    for (const [extension, size] of sizeByExtension.entries()) {
      await reportMeasurement(
        `${metricName}/responseSizes/${extension}`,
        size,
        'bytes'
      )
      totalDownload += size
    }
    await reportMeasurement(
      `${metricName}/responseSizes`,
      totalDownload,
      'bytes'
    )
    let totalRequests = 0
    for (const [extension, count] of requestsByExtension.entries()) {
      await reportMeasurement(
        `${metricName}/requests/${extension}`,
        count,
        'requests'
      )
      totalRequests += count
    }
    await reportMeasurement(`${metricName}/requests`, totalRequests, 'requests')
    await reportMeasurement(`${metricName}/console/logs`, logCount, 'messages')
    await reportMeasurement(
      `${metricName}/console/warnings`,
      warningCount,
      'messages'
    )
    await reportMeasurement(
      `${metricName}/console/errors`,
      errorCount,
      'messages'
    )
    await reportMeasurement(
      `${metricName}/console/uncaught`,
      uncaughtCount,
      'messages'
    )
    await reportMeasurement(
      `${metricName}/console`,
      logCount + warningCount + errorCount + uncaughtCount,
      'messages'
    )
  } finally {
    page.off('response', responseHandler)
  }
}

/**
 * Waits until network requests have all been resolved
 * @param page - Playwright page object
 * @param delayMs - Amount of time in ms to wait after the last request resolves before cleaning up
 * @param timeoutMs - Amount of time to wait before continuing. In case of timeout, this function resolves
 * @returns
 */
function networkIdle(
  page: Page,
  delayMs = 300,
  timeoutMs = 180000
): Promise<number> {
  return new Promise((resolve) => {
    const cleanup = () => {
      page.off('request', requestHandler)
      page.off('requestfailed', requestFinishedHandler)
      page.off('requestfinished', requestFinishedHandler)
      clearTimeout(fullTimeout)
      if (timeout) {
        clearTimeout(timeout)
      }
    }

    const requests = new Map<string, number>()
    const start = Date.now()
    let lastRequest: number
    let timeout: NodeJS.Timeout | null = null

    const fullTimeout = setTimeout(() => {
      cleanup()
      console.error(
        `Timeout while waiting for network idle. These requests are still pending: ${Array.from(
          requests
        ).join(', ')}} time is ${lastRequest - start}`
      )
      resolve(Date.now() - lastRequest)
    }, timeoutMs)

    const requestFilter = (request: Request) => {
      return request.headers().accept !== 'text/event-stream'
    }

    const requestHandler = (request: Request) => {
      requests.set(request.url(), (requests.get(request.url()) ?? 0) + 1)
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      // Avoid tracking some requests, but we only know this after awaiting
      // so we need to do this weird stunt to ensure that
      if (!requestFilter(request)) {
        requestFinishedInternal(request)
      }
    }

    const requestFinishedHandler = (request: Request) => {
      if (requestFilter(request)) {
        requestFinishedInternal(request)
      }
    }

    const requestFinishedInternal = (request: Request) => {
      lastRequest = Date.now()
      const currentCount = requests.get(request.url())
      if (currentCount === undefined) {
        console.error(
          `Unexpected untracked but completed request ${request.url()}`
        )
        return
      }

      if (currentCount === 1) {
        requests.delete(request.url())
      } else {
        requests.set(request.url(), currentCount - 1)
      }

      if (requests.size === 0) {
        timeout = setTimeout(() => {
          cleanup()
          resolve(Date.now() - lastRequest)
        }, delayMs)
      }
    }

    page.on('request', requestHandler)
    page.on('requestfailed', requestFinishedHandler)
    page.on('requestfinished', requestFinishedHandler)
  })
}

class BrowserSessionImpl implements BrowserSession {
  private browser: Browser
  private context: BrowserContext
  private page: Page | null
  constructor(browser: Browser, context: BrowserContext) {
    this.browser = browser
    this.context = context
    this.page = null
  }

  async close() {
    if (this.page) {
      await this.page.close()
    }
    await this.context.close()
    await this.browser.close()
  }

  async hardNavigation(metricName: string, url: string) {
    this.page = this.page ?? (await this.context.newPage())

    const page = this.page
    await withRequestMetrics(metricName, page, async () => {
      await measureTime(`${metricName}/start`)
      const idle = networkIdle(page, 3000)
      await page.goto(url, {
        waitUntil: 'commit',
      })
      await measureTime(`${metricName}/html`, {
        relativeTo: `${metricName}/start`,
      })
      await page.waitForLoadState('domcontentloaded')
      await measureTime(`${metricName}/dom`, {
        relativeTo: `${metricName}/start`,
      })
      await page.waitForLoadState('load')
      await measureTime(`${metricName}/load`, {
        relativeTo: `${metricName}/start`,
      })
      const offset = await idle
      await measureTime(`${metricName}`, {
        offset,
        relativeTo: `${metricName}/start`,
      })
    })
    return page
  }

  async softNavigationByClick(metricName: string, selector: string) {
    const page = this.page
    if (!page) {
      throw new Error(
        'softNavigationByClick() must be called after hardNavigation()'
      )
    }
    await withRequestMetrics(metricName, page, async () => {
      await measureTime(`${metricName}/start`)
      const firstResponse = new Promise<void>((resolve) => {
        page.once('response', () => {
          resolve()
        })
      })
      const idle = networkIdle(page, 3000)
      await page.click(selector)
      await firstResponse
      await measureTime(`${metricName}/firstResponse`, {
        relativeTo: `${metricName}/start`,
      })
      await idle
      await measureTime(`${metricName}`, {
        offset: 3000,
        relativeTo: `${metricName}/start`,
      })
    })
  }

  async reload(metricName: string) {
    const page = this.page
    if (!page) {
      throw new Error('reload() must be called after hardNavigation()')
    }
    await withRequestMetrics(metricName, page, async () => {
      await measureTime(`${metricName}/start`)
      const idle = networkIdle(page, 3000)
      await page.reload({
        waitUntil: 'commit',
      })
      await measureTime(`${metricName}/html`, {
        relativeTo: `${metricName}/start`,
      })
      await page.waitForLoadState('domcontentloaded')
      await measureTime(`${metricName}/dom`, {
        relativeTo: `${metricName}/start`,
      })
      await page.waitForLoadState('load')
      await measureTime(`${metricName}/load`, {
        relativeTo: `${metricName}/start`,
      })
      await idle
      await measureTime(`${metricName}`, {
        offset: 3000,
        relativeTo: `${metricName}/start`,
      })
    })
  }
}

export async function newBrowserSession(options: {
  headless?: boolean
  devtools?: boolean
  baseURL?: string
}): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: options.headless ?? process.env.HEADLESS !== 'false',
    devtools: true,
    timeout: 60000,
  })
  const context = await browser.newContext({
    baseURL: options.baseURL ?? 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
  })
  context.setDefaultTimeout(120000)
  context.setDefaultNavigationTimeout(120000)
  return new BrowserSessionImpl(browser, context)
}

// see next.js/test/lib/browsers/playwright.ts
