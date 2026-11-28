import { nextTestSetup } from 'e2e-utils'

type StepResult = { index: number; type: string; ok: boolean; error?: string }
type BrowserActionsResult = {
  passed: boolean
  finalUrl: string
  results: StepResult[]
  consoleErrors: string[]
  blockedRequests: string[]
  error?: string
}

async function callRunBrowserActions(
  url: string,
  args: Record<string, unknown>
): Promise<BrowserActionsResult> {
  const response = await fetch(`${url}/_next/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'run_browser_actions-' + Date.now(),
      method: 'tools/call',
      params: { name: 'run_browser_actions', arguments: args },
    }),
  })
  const text = await response.text()
  const match = text.match(/data: ({.*})/s)
  expect(match).toBeTruthy()
  const envelope = JSON.parse(match![1])
  return JSON.parse(envelope.result?.content?.[0]?.text)
}

describe('mcp-server run_browser_actions tool', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('runs a scripted flow and reports every step', async () => {
    const result = await callRunBrowserActions(next.url, {
      actions: [
        { type: 'goto', path: '/' },
        { type: 'waitForSelector', selector: '#greet:not([disabled])' },
        { type: 'fill', selector: '#name', value: 'Next' },
        { type: 'click', selector: '#greet' },
        { type: 'waitForSelector', selector: '#greeting:not(:empty)' },
        { type: 'expectText', selector: '#greeting', text: 'Hello, Next!' },
        { type: 'getText', selector: 'h1' },
      ],
    })

    expect(result.error).toBeUndefined()
    expect(result.passed).toBe(true)
    expect(result.results).toHaveLength(7)
    expect(result.results.every((step) => step.ok)).toBe(true)
    expect(result.results[6]).toMatchObject({ text: 'Browser actions' })
    expect(result.finalUrl).toBe(`${next.url}/`)
  })

  it('stops at the first failing step', async () => {
    const result = await callRunBrowserActions(next.url, {
      actions: [
        { type: 'goto', path: '/' },
        { type: 'expectText', selector: '#greeting', text: 'never rendered' },
        { type: 'click', selector: '#greet' },
      ],
      stepTimeoutMs: 2000,
    })

    expect(result.passed).toBe(false)
    expect(result.results).toHaveLength(2)
    expect(result.results[1]).toMatchObject({ index: 1, ok: false })
    expect(result.results[1].error).toContain('never rendered')
  })

  it('refuses to navigate away from the dev server origin', async () => {
    const result = await callRunBrowserActions(next.url, {
      actions: [
        { type: 'goto', path: 'http://169.254.169.254/latest/meta-data' },
      ],
    })

    expect(result.passed).toBe(false)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].ok).toBe(false)
    expect(result.results[0].error).toContain('not allowed')
  })
  it('blocks redirects to another origin', async () => {
    const result = await callRunBrowserActions(next.url, {
      actions: [{ type: 'goto', path: '/leave' }],
      stepTimeoutMs: 3000,
    })

    expect(result.passed).toBe(false)
    expect(result.blockedRequests).toContain('http://127.0.0.1:59999/outside')
    expect(result.finalUrl).not.toContain('127.0.0.1')
  })

  it('blocks clicked links that leave the dev server origin', async () => {
    const result = await callRunBrowserActions(next.url, {
      actions: [
        { type: 'goto', path: '/' },
        { type: 'click', selector: '#external' },
        { type: 'expectText', selector: 'h1', text: 'Browser actions' },
      ],
      stepTimeoutMs: 3000,
    })

    expect(result.blockedRequests).toContain('http://127.0.0.1:59999/outside')
    expect(result.finalUrl).not.toContain('127.0.0.1')
  })
})
