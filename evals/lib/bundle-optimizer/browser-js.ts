import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { chromium, expect } from 'playwright/test'
import type { Browser, Page } from 'playwright/test'

const appRequire = createRequire(join(process.cwd(), 'package.json'))

function startNext(args: string[]) {
  const child = spawn(
    process.execPath,
    [appRequire.resolve('next/dist/bin/next'), ...args],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    }
  )
  let output = ''
  child.stdout.on('data', (data) => (output += data))
  child.stderr.on('data', (data) => (output += data))
  return { child, output: () => output }
}

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
  const build = startNext(['build'])
  const buildTimeout = setTimeout(() => build.child.kill('SIGKILL'), 180_000)
  try {
    const [code] = await once(build.child, 'exit')
    assert.equal(code, 0, build.output())
  } finally {
    clearTimeout(buildTimeout)
  }

  const server = startNext(['start', '--hostname', '127.0.0.1', '--port', '0'])
  let browser: Browser | undefined
  try {
    let url: string | undefined
    await expect
      .poll(
        async () => {
          assert.equal(server.child.exitCode, null, server.output())
          url = server.output().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
          if (!url) return false
          try {
            const response = await fetch(url, {
              signal: AbortSignal.timeout(2000),
            })
            await response.arrayBuffer()
            return response.ok
          } catch {
            return false
          }
        },
        { timeout: 30_000 }
      )
      .toBe(true)
    assert(url, 'Missing production server URL')
    browser = await chromium.launch({ headless: true })
    return await verify(browser, url)
  } finally {
    try {
      await browser?.close()
    } finally {
      if (server.child.exitCode === null && server.child.signalCode === null) {
        const exited = once(server.child, 'exit')
        server.child.kill('SIGTERM')
        const killTimeout = setTimeout(() => server.child.kill('SIGKILL'), 5000)
        await exited
        clearTimeout(killTimeout)
      }
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
    const pending: Promise<void>[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('requestfailed', (request) => errors.push(request.url()))
    page.on('response', (response) => {
      if (
        response.request().resourceType() !== 'script' &&
        !/javascript/.test(response.headers()['content-type'] ?? '')
      )
        return
      pending.push(
        (async () => {
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
        })().catch((error) => {
          errors.push(error.message)
        })
      )
    })
    const response = await page.goto(url, { waitUntil: 'networkidle' })
    assert(response?.ok(), 'Initial navigation failed')
    async function snapshot(): Promise<JavaScriptSummary> {
      await page.waitForLoadState('networkidle')
      await Promise.all(pending)
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

export function runBrowserJsEval<
  Details extends Record<string, unknown> = Record<string, unknown>,
>(budgetBytes: number): BrowserJsEvalResult<Details> {
  const source = process.env.NEXT_EVAL_BROWSER_JS_SOURCE
  const baseline = process.env.NEXT_EVAL_BROWSER_JS_BEFORE
  assert(source, 'Missing runner-provided browser measurement')
  assert(baseline, 'Missing pre-agent browser measurement')
  const before = readBrowserJsMeasurement<Details>(
    'NEXT_EVAL_BROWSER_JS:' + baseline
  )
  let after = before
  if (process.env.NEXT_EVAL_BROWSER_JS_PHASE !== 'before') {
    const measurementPath = join(
      process.cwd(),
      '__agent_eval__',
      'measure-browser-js.mjs'
    )
    writeFileSync(measurementPath, source)
    const result = spawnSync(process.execPath, [measurementPath], {
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    })
    if (result.error) throw result.error
    assert.equal(result.status, 0, result.stderr)
    after = readBrowserJsMeasurement<Details>(result.stdout)
  }
  const measurement = {
    before,
    after,
    budgetBytes,
    savedBytes: before.initial.encodedBytes - after.initial.encodedBytes,
  }
  console.log('NEXT_EVAL_BROWSER_JS_RESULT:' + JSON.stringify(measurement))
  return measurement
}
