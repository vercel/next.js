import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { chromium, expect } from 'playwright/test'
import type { Browser, Page, Request } from 'playwright/test'
import { buildNextApp, startNextServer } from '../next-test-utils.mjs'

export type ScriptRequest = {
  url: string
  encodedBytes: number
  decodedBytes: number
} & Record<string, unknown>

export type JavaScriptSummary = {
  encodedBytes: number
  decodedBytes: number
  requests: ScriptRequest[]
}

export type BaselineCheck = {
  name: string
  status: 'passed' | 'failed'
  failures: string[]
}

export type BrowserMeasurement<
  Details extends Record<string, unknown> = Record<string, unknown>,
> = {
  initial: JavaScriptSummary
  checks?: BaselineCheck[]
} & Details

export type BrowserJsEvalResult<
  Details extends Record<string, unknown> = Record<string, unknown>,
> = {
  before: BrowserMeasurement<Details>
  after: BrowserMeasurement<Details>
  budgetBytes: number
  savedBytes: number
}

export async function withProductionBrowser<T>(
  verify: (browser: Browser, url: string) => Promise<T>
): Promise<T> {
  await rm('.next', { recursive: true, force: true })
  await buildNextApp()
  const server = await startNextServer()
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ headless: true })
    return await verify(browser, server.url)
  } finally {
    try {
      await browser?.close()
    } finally {
      await server.stop()
    }
  }
}

export function summarizeJavaScript(
  requests: ScriptRequest[]
): JavaScriptSummary {
  return {
    encodedBytes: requests.reduce((sum, item) => sum + item.encodedBytes, 0),
    decodedBytes: requests.reduce((sum, item) => sum + item.decodedBytes, 0),
    requests: [...requests],
  }
}

export async function withMeasuredPage<T>(
  browser: Browser,
  url: string,
  verify: (
    page: Page,
    snapshot: () => Promise<JavaScriptSummary>
  ) => Promise<T>,
  classifyScript: (body: Buffer) => Record<string, boolean> = () => ({})
): Promise<T> {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    const requests: ScriptRequest[] = []
    const pending = new Set<Promise<void>>()
    const inFlight = new Set<Request>()
    let lastActivity = Date.now()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      inFlight.add(request)
      lastActivity = Date.now()
    })
    page.on('requestfinished', (request) => {
      inFlight.delete(request)
      lastActivity = Date.now()
    })
    page.on('requestfailed', (request) => {
      inFlight.delete(request)
      lastActivity = Date.now()
      errors.push(request.url())
    })
    page.on('response', (response) => {
      if (
        response.request().resourceType() !== 'script' &&
        !/javascript/.test(response.headers()['content-type'] ?? '')
      )
        return
      const measured = (async () => {
        assert.equal(await response.finished(), null, response.url())
        assert(response.ok(), `Script failed: ${response.url()}`)
        const sizes = await response.request().sizes()
        const body = await response.body()
        requests.push({
          ...classifyScript(body),
          url: response.url(),
          encodedBytes: sizes.responseBodySize,
          decodedBytes: body.length,
        })
      })()
        .catch((error) => {
          errors.push(error.message)
        })
        .finally(() => {
          pending.delete(measured)
        })
      pending.add(measured)
    })
    const response = await page.goto(url, { waitUntil: 'load' })
    assert(response?.ok(), 'Initial navigation failed')
    async function snapshot(): Promise<JavaScriptSummary> {
      // Playwright's navigation load state stays satisfied after interactions.
      await expect
        .poll(
          () =>
            inFlight.size === 0 &&
            pending.size === 0 &&
            Date.now() - lastActivity >= 500,
          { timeout: 30_000 }
        )
        .toBe(true)
      assert.deepEqual(errors, [])
      return summarizeJavaScript(requests)
    }
    const result = await verify(page, snapshot)
    await snapshot()
    return result
  } finally {
    await context.close()
  }
}

export function readBrowserJsMeasurement<
  Details extends Record<string, unknown> = Record<string, unknown>,
>(output: string): BrowserMeasurement<Details> {
  const match = output.match(/NEXT_EVAL_BROWSER_JS:(\{[^\r\n]+\})/)
  assert(match, 'Missing browser JavaScript measurement')
  const measurement: BrowserMeasurement<Details> = JSON.parse(match[1])
  assert(
    Number.isFinite(measurement.initial?.encodedBytes) &&
      measurement.initial.encodedBytes > 0,
    'Invalid compressed JavaScript bytes'
  )
  assert(
    Number.isFinite(measurement.initial?.decodedBytes) &&
      measurement.initial.decodedBytes > 0,
    'Invalid decoded JavaScript bytes'
  )
  assert(measurement.initial.requests?.length, 'Missing JavaScript requests')
  return measurement
}

export async function runBrowserJsEval<
  Details extends Record<string, unknown> = Record<string, unknown>,
>(
  budgetBytes: number,
  measure: () => Promise<BrowserMeasurement<Details>>
): Promise<BrowserJsEvalResult<Details>> {
  const baseline = process.env.NEXT_EVAL_BROWSER_JS_BEFORE
  const isBaseline = process.env.NEXT_EVAL_BROWSER_JS_PHASE === 'before'
  assert(isBaseline || baseline, 'Missing pre-agent browser measurement')
  const after = await measure()
  const before = isBaseline
    ? after
    : readBrowserJsMeasurement<Details>('NEXT_EVAL_BROWSER_JS:' + baseline)
  const measurement = {
    before,
    after,
    budgetBytes,
    savedBytes: before.initial.encodedBytes - after.initial.encodedBytes,
  }
  console.log('NEXT_EVAL_BROWSER_JS_RESULT:' + JSON.stringify(measurement))
  return measurement
}
