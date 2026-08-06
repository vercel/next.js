/**
 * @jest-environment node
 */

import { context, trace } from '@opentelemetry/api'
import { AppRenderSpan, NextVanillaSpanAllowlist } from '../lib/trace/constants'
import { registerLocalSpanRecorder } from '../lib/trace/local-span-recorder'
import {
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from '../lib/trace/span-store'
import { createHTMLRenderCompletionTracker } from './html-render-completion'

const originalDevServer = process.env.__NEXT_DEV_SERVER
const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS
const spanRecords: SpanStoreRecord[] = []

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('createHTMLRenderCompletionTracker', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    setSpanRecorderForTest((span) => spanRecords.push(span))
    registerLocalSpanRecorder()
  })

  afterEach(() => {
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
    if (originalRequestInsights === undefined) {
      delete process.env.__NEXT_REQUEST_INSIGHTS
    } else {
      process.env.__NEXT_REQUEST_INSIGHTS = originalRequestInsights
    }
    context.disable()
    trace.disable()
    setSpanRecorderForTest(undefined)
    spanRecords.length = 0
  })

  it('keeps HTML completion out of default OpenTelemetry output', () => {
    expect(
      NextVanillaSpanAllowlist.has(AppRenderSpan.waitForHTMLCompletion)
    ).toBe(false)
  })

  it('settles the render when the current HTML generation completes', async () => {
    const finishRender = jest.fn()
    const tracker = createHTMLRenderCompletionTracker(finishRender)

    tracker.track(Promise.resolve())
    await flushMicrotasks()

    expect(finishRender).toHaveBeenCalledTimes(1)
    expect(finishRender).toHaveBeenCalledWith(undefined)
    expect(spanRecords).toEqual([
      expect.objectContaining({
        name: 'wait for HTML completion',
        status: 'ok',
      }),
    ])
  })

  it('lets a fallback generation own render completion', async () => {
    const finishRender = jest.fn()
    const tracker = createHTMLRenderCompletionTracker(finishRender)
    let resolveInitial!: () => void
    const initial = new Promise<void>((resolve) => {
      resolveInitial = resolve
    })
    const initialError = new Error('initial render failed')

    tracker.track(initial)
    tracker.supersede(initialError)
    tracker.track(Promise.resolve())
    resolveInitial()
    await flushMicrotasks()

    expect(finishRender).toHaveBeenCalledTimes(1)
    expect(finishRender).toHaveBeenCalledWith(undefined)
    expect(spanRecords.map((span) => span.status)).toEqual(['error', 'ok'])
    expect(spanRecords[0].error).toEqual(
      expect.objectContaining({ message: initialError.message })
    )
  })

  it('defers rejection so recovery can supersede the failed generation', async () => {
    const finishRender = jest.fn()
    const tracker = createHTMLRenderCompletionTracker(finishRender)
    const initialError = new Error('initial render failed')

    const initial = Promise.reject(initialError)
    async function continueRender() {
      await initial
    }

    tracker.track(initial)
    try {
      await continueRender()
    } catch (error) {
      tracker.supersede(error)
      tracker.track(Promise.resolve())
    }
    await flushMicrotasks()

    expect(finishRender).toHaveBeenCalledTimes(1)
    expect(finishRender).toHaveBeenCalledWith(undefined)
    expect(spanRecords.map((span) => span.status)).toEqual(['error', 'ok'])
  })

  it('fails the render when the current generation rejects', async () => {
    const finishRender = jest.fn()
    const tracker = createHTMLRenderCompletionTracker(finishRender)
    const error = new TypeError('HTML render failed')

    tracker.track(Promise.reject(error))
    await flushMicrotasks()

    expect(finishRender).toHaveBeenCalledTimes(1)
    expect(finishRender).toHaveBeenCalledWith({ error })
    expect(spanRecords).toEqual([
      expect.objectContaining({
        name: 'wait for HTML completion',
        status: 'error',
        error: expect.objectContaining({
          type: 'TypeError',
          message: error.message,
        }),
      }),
    ])
  })
})
