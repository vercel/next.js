/**
 * Agent-scoped HMR batching, end to end against a real dev server.
 *
 * The reproduction these tests encode: an agent making a multi-step edit
 * produces one HMR update per step, so the browser preview walks through every
 * half-finished intermediate state, and compile errors land in the browser's
 * error overlay rather than in the hands of the agent that caused them.
 */
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry, waitForNoRedbox } from 'next-test-utils'

describe('mcp-server agent HMR batching', () => {
  const { next, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'hmr-batch-app'),
  })

  if (skipped) {
    return
  }

  async function callMcp(method: string, params: object) {
    const response = await fetch(`${next.url}/_next/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'hmr-batch',
        method,
        params,
      }),
    })

    const text = await response.text()
    const match = text.match(/data: ({.*})/s)
    expect(match).toBeTruthy()
    return JSON.parse(match![1]).result
  }

  async function callTool(name: string, args: object = {}) {
    const result = await callMcp('tools/call', { name, arguments: args })
    return JSON.parse(result?.content?.[0]?.text)
  }

  type BatchStatus = {
    enabled: boolean
    open: boolean
    batchId: string | null
    heldMessageCount: number
    heldMessageTypes: Record<string, number>
    pendingFromPreviousBatch: number
    errors: Array<{ message: string }>
  }

  const getStatus = (): Promise<BatchStatus> => callTool('get_hmr_batch_status')

  /** How many compilations this batch has held so far. */
  const builtCount = (status: BatchStatus) => status.heldMessageTypes.built ?? 0

  async function setMessage(value: string) {
    await next.patchFile(
      'app/message.ts',
      `export const message = '${value}'\n`
    )
  }

  /**
   * Writes a file and waits until the dev server has finished compiling it and
   * the open batch has held the result. Waiting on the batch's own accounting
   * rather than on a timeout is what makes "the preview did not move" a real
   * assertion instead of a race.
   */
  async function editAndAwaitHeldCompile(write: () => Promise<void>) {
    const before = builtCount(await getStatus())
    await write()

    let status: BatchStatus
    await retry(async () => {
      status = await getStatus()
      expect(builtCount(status)).toBeGreaterThan(before)
    }, 30_000)

    return status!
  }

  const readMessage = (browser: Awaited<ReturnType<typeof next.browser>>) =>
    browser.elementByCss('#message').text()

  afterEach(async () => {
    // Leave no batch open for the next test, whatever happened in this one.
    const status = await getStatus()
    if (status.open) {
      await callTool('end_hmr_batch')
    }
  })

  it('exposes the batch tools when experimental.agentHmrBatching is on', async () => {
    const { tools } = await callMcp('tools/list', {})
    const names = tools.map((tool: { name: string }) => tool.name)

    expect(names).toContain('begin_hmr_batch')
    expect(names).toContain('end_hmr_batch')
    expect(names).toContain('get_hmr_batch_status')

    expect(await getStatus()).toMatchObject({
      enabled: true,
      open: false,
      batchId: null,
    })
  })

  it('changes nothing about HMR while no batch is open', async () => {
    await setMessage('no-batch-before')
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await readMessage(browser)).toBe('no-batch-before')
    }, 15_000)

    await setMessage('no-batch-after')

    await retry(async () => {
      expect(await readMessage(browser)).toBe('no-batch-after')
    }, 15_000)
  })

  it('keeps the preview on the last good state for the length of a batch', async () => {
    await setMessage('before-batch')
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await readMessage(browser)).toBe('before-batch')
    }, 15_000)

    const begun = await callTool('begin_hmr_batch')
    expect(begun).toMatchObject({ status: 'opened' })

    // A multi-step edit: three separate writes, each compiled by the dev
    // server, none of them shown.
    for (const step of ['step-1', 'step-2', 'step-3']) {
      await editAndAwaitHeldCompile(() => setMessage(step))
      expect(await readMessage(browser)).toBe('before-batch')
    }

    const status = await getStatus()
    expect(status.open).toBe(true)
    expect(status.batchId).toBe(begun.batchId)
    expect(status.heldMessageCount).toBeGreaterThan(0)

    const ended = await callTool('end_hmr_batch')
    expect(ended).toMatchObject({
      status: 'flushed',
      batchId: begun.batchId,
      compiled: true,
      errors: [],
      previewPreserved: true,
    })

    // One jump, from the state before the batch straight to the final one.
    await retry(async () => {
      expect(await readMessage(browser)).toBe('step-3')
    }, 15_000)
  })

  it('hands compile errors to the agent and leaves the preview alone', async () => {
    await setMessage('last-good')
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await readMessage(browser)).toBe('last-good')
    }, 15_000)

    expect(await callTool('begin_hmr_batch')).toMatchObject({
      status: 'opened',
    })

    await editAndAwaitHeldCompile(async () => {
      await next.patchFile(
        'app/message.ts',
        `import { missing } from './does-not-exist'\n` +
          `export const message = missing\n`
      )
    })

    const ended = await callTool('end_hmr_batch')

    expect(ended.status).toBe('withheld')
    expect(ended.compiled).toBe(true)
    expect(ended.errors.length).toBeGreaterThan(0)
    expect(
      ended.errors.map((error: { message: string }) => error.message).join('\n')
    ).toContain('does-not-exist')

    // The error went to the agent, not to the human watching the preview.
    expect(await readMessage(browser)).toBe('last-good')
    await waitForNoRedbox(browser)

    // The held updates were not thrown away: fixing the code releases them.
    await setMessage('after-fix')
    await retry(async () => {
      expect(await readMessage(browser)).toBe('after-fix')
    }, 15_000)
  })

  it('does not nest batches', async () => {
    const first = await callTool('begin_hmr_batch')
    expect(first.status).toBe('opened')

    const second = await callTool('begin_hmr_batch')
    expect(second).toMatchObject({
      status: 'already-open',
      batchId: first.batchId,
    })

    const ended = await callTool('end_hmr_batch')
    expect(ended.batchId).toBe(first.batchId)

    expect(await callTool('end_hmr_batch')).toMatchObject({
      status: 'no-batch',
    })
  })
})
