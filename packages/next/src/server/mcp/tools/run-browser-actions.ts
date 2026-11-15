import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { createRequire } from 'module'
import { join } from 'path'
import { z } from 'next/dist/compiled/zod'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

const MAX_ACTIONS = 50
const DEFAULT_STEP_TIMEOUT_MS = 5_000
const MAX_STEP_TIMEOUT_MS = 30_000
const MAX_TEXT_LENGTH = 2_000

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('goto'),
    path: z
      .string()
      .describe('Path on the dev server to open, e.g. "/" or "/blog/1".'),
  }),
  z.object({ type: z.literal('click'), selector: z.string() }),
  z.object({
    type: z.literal('fill'),
    selector: z.string(),
    value: z.string(),
  }),
  z.object({
    type: z.literal('press'),
    selector: z.string(),
    key: z.string().describe('A Playwright key name, e.g. "Enter".'),
  }),
  z.object({ type: z.literal('waitForSelector'), selector: z.string() }),
  z.object({ type: z.literal('getText'), selector: z.string() }),
  z.object({
    type: z.literal('expectText'),
    selector: z.string(),
    text: z.string().describe('Substring the element text must contain.'),
  }),
])

export type BrowserAction = z.infer<typeof actionSchema>

type StepResult = {
  index: number
  type: BrowserAction['type']
  ok: boolean
  text?: string
  error?: string
}

/**
 * Resolves a path against the dev server origin and refuses anything that
 * would leave it. The browser is driven by an agent, so it must never be
 * pointed at arbitrary hosts (e.g. internal services or metadata endpoints).
 */
export function resolveSameOriginUrl(
  devServerUrl: string,
  path: string
): string {
  const base = new URL(devServerUrl)
  const resolved = new URL(path, base)
  if (resolved.origin !== base.origin) {
    throw new Error(
      `Navigation to ${resolved.origin} is not allowed; only ${base.origin} can be opened.`
    )
  }
  return resolved.toString()
}

/**
 * Decides whether the browser may make a request. `resolveSameOriginUrl` only
 * checks the URL passed to `goto`; this is applied to every request the page
 * makes (redirects, subresources, clicked links) so the browser can never
 * reach a host other than the dev server. Non-network URLs (`data:`, `blob:`,
 * `about:`) are allowed.
 */
export function isAllowedRequestUrl(
  devServerUrl: string,
  requestUrl: string
): boolean {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return false
  }
  if (['data:', 'blob:', 'about:'].includes(url.protocol)) return true
  const base = new URL(devServerUrl)
  // The dev server also serves websockets (e.g. HMR) on the same host.
  const protocols =
    base.protocol === 'https:' ? ['https:', 'wss:'] : ['http:', 'ws:']
  return protocols.includes(url.protocol) && url.host === base.host
}

function loadPlaywright(projectPath: string): any {
  // Prefer the project's own install, then fall back to whatever `next` can
  // resolve itself (e.g. a hoisted or peer-dependency install).
  const requirers = [
    createRequire(join(projectPath, 'package.json')),
    createRequire(__filename),
  ]
  for (const requireFrom of requirers) {
    for (const name of ['@playwright/test', 'playwright']) {
      try {
        return requireFrom(name)
      } catch {}
    }
  }
  throw new Error(
    'Playwright is not installed in this project. Install it with `npm i -D @playwright/test` and run `npx playwright install chromium`.'
  )
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH) + '…'
    : text
}

export function registerRunBrowserActionsTool(
  server: McpServer,
  projectPath: string,
  getDevServerUrl: () => string | undefined
) {
  server.registerTool(
    'run_browser_actions',
    {
      description:
        'Runs a scripted list of actions (goto, click, fill, press, waitForSelector, getText, expectText) in a headless Playwright browser against this dev server, and returns per-step results plus browser console errors. Every browser request, including redirects and clicked links, is restricted to the dev server origin; other requests are blocked and listed in blockedRequests. Requires `experimental.mcpBrowserActions` and Playwright installed in the project.',
      inputSchema: {
        actions: z
          .array(actionSchema)
          .min(1)
          .max(MAX_ACTIONS)
          .describe(
            'Actions to run in order. Execution stops at the first failure.'
          ),
        stepTimeoutMs: z
          .number()
          .int()
          .positive()
          .max(MAX_STEP_TIMEOUT_MS)
          .optional()
          .describe(
            `Timeout per step in milliseconds (default ${DEFAULT_STEP_TIMEOUT_MS}).`
          ),
      },
    },
    async (request) => {
      mcpTelemetryTracker.recordToolCall('mcp/run_browser_actions')

      const respond = (payload: unknown) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      })

      let browser: any
      try {
        const devServerUrl = getDevServerUrl()
        if (!devServerUrl) {
          return respond({ error: 'The dev server URL is not available yet.' })
        }

        const { chromium } = loadPlaywright(projectPath)
        const timeout = request.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS

        browser = await chromium.launch({ headless: true })
        const context = await browser.newContext()
        const blockedRequests: string[] = []
        const page = await context.newPage()
        // Intercept at the browser's network layer. Unlike `page.route`, the
        // CDP Fetch domain pauses every request, including each redirect hop
        // and subresources, without rewriting responses.
        const cdp = await context.newCDPSession(page)
        cdp.on('Fetch.requestPaused', async (event: any) => {
          try {
            if (isAllowedRequestUrl(devServerUrl, event.request.url)) {
              await cdp.send('Fetch.continueRequest', {
                requestId: event.requestId,
              })
            } else {
              blockedRequests.push(truncate(event.request.url))
              await cdp.send('Fetch.failRequest', {
                requestId: event.requestId,
                errorReason: 'BlockedByClient',
              })
            }
          } catch {}
        })
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
        // New tabs would not be covered by the session above.
        context.on('page', (popup: any) => {
          blockedRequests.push('(new browser tab)')
          popup.close().catch(() => {})
        })
        page.setDefaultTimeout(timeout)

        const consoleErrors: string[] = []
        page.on('console', (msg: any) => {
          if (msg.type() === 'error') consoleErrors.push(truncate(msg.text()))
        })
        page.on('pageerror', (err: Error) => {
          consoleErrors.push(truncate(err.message))
        })

        const results: StepResult[] = []
        for (const [index, action] of request.actions.entries()) {
          const result: StepResult = { index, type: action.type, ok: true }
          try {
            switch (action.type) {
              case 'goto':
                await page.goto(resolveSameOriginUrl(devServerUrl, action.path))
                break
              case 'click':
                await page.click(action.selector)
                break
              case 'fill':
                await page.fill(action.selector, action.value)
                break
              case 'press':
                await page.press(action.selector, action.key)
                break
              case 'waitForSelector':
                await page.waitForSelector(action.selector)
                break
              case 'getText':
                result.text = truncate(
                  (await page.textContent(action.selector)) ?? ''
                )
                break
              case 'expectText': {
                const actual = (await page.textContent(action.selector)) ?? ''
                if (!actual.includes(action.text)) {
                  throw new Error(
                    `Expected "${action.selector}" to contain "${action.text}" but got "${truncate(actual)}".`
                  )
                }
                break
              }
              default:
                action satisfies never
            }
          } catch (error) {
            result.ok = false
            result.error =
              error instanceof Error ? error.message : String(error)
          }
          results.push(result)
          if (!result.ok) break
        }

        return respond({
          passed: results.every((r) => r.ok),
          finalUrl: page.url(),
          results,
          consoleErrors,
          blockedRequests,
        })
      } catch (error) {
        return respond({
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        await browser?.close().catch(() => {})
      }
    }
  )
}
