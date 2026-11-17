import { Readable } from 'node:stream'
import {
  clearRequestInsightsForTest,
  getRequestInsightsSnapshot,
  registerRequestInsightsExporter,
  startRequestInsight,
} from '../lib/trace/request-insights'
import { runWithRequestInsightsIdentity } from '../lib/trace/request-insights-identity'
import { RscPayloadAnalyzer } from './rsc-payload-analysis'
import { tapRscPayloadForRequestInsights } from './rsc-payload-tap'

const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS
const originalDevServer = process.env.__NEXT_DEV_SERVER

const PAYLOAD_ROWS = [
  '1:I["[project]/app/client.tsx [app-client] (ecmascript)",[],"Table"]\n',
  '0:["$","$L1",null,{"rows":[1,2,3]}]\n',
]
const PAYLOAD = PAYLOAD_ROWS.join('')

const identity = {
  requestId: 'tap-request',
  htmlRequestId: 'tap-request',
  url: '/',
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

function tap<T>(stream: T): T {
  return runWithRequestInsightsIdentity(identity, () =>
    tapRscPayloadForRequestInsights(stream as any)
  ) as T
}

function getRecordedPayload() {
  return getRequestInsightsSnapshot().requests.find(
    (request) => request.requestId === identity.requestId
  )?.rscPayload
}

// Analysis is deferred to a later task, after the end is forwarded.
function waitForAnalysis() {
  return new Promise((resolve) => setImmediate(resolve))
}

function createWebSource(chunks: Uint8Array[]) {
  let pulls = 0
  let index = 0
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++
        if (index < chunks.length) {
          controller.enqueue(chunks[index++])
        } else {
          controller.close()
        }
      },
    },
    { highWaterMark: 0 }
  )
  return { stream, getPulls: () => pulls }
}

function createNodeSource(chunks: Buffer[]) {
  let reads = 0
  let index = 0
  const stream = new Readable({
    read() {
      reads++
      this.push(index < chunks.length ? chunks[index++] : null)
    },
  })
  return { stream, getReads: () => reads }
}

async function readWeb(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return chunks
    chunks.push(value)
  }
}

async function readNode(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('tapRscPayloadForRequestInsights', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    registerRequestInsightsExporter()
    startRequestInsight(identity)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    restoreEnv('__NEXT_REQUEST_INSIGHTS', originalRequestInsights)
    restoreEnv('__NEXT_DEV_SERVER', originalDevServer)
    clearRequestInsightsForTest()
  })

  describe('web streams', () => {
    it('forwards split chunks unchanged and records the payload after the end', async () => {
      const bytes = Buffer.from(PAYLOAD)
      const chunks = [
        bytes.subarray(0, 7),
        bytes.subarray(7, 40),
        bytes.subarray(40),
      ]
      const { stream } = createWebSource(chunks)
      const tapped = tap(stream)

      const forwarded = await readWeb(tapped)
      expect(Buffer.concat(forwarded).equals(bytes)).toBe(true)
      expect(forwarded).toHaveLength(chunks.length)
      expect(getRecordedPayload()).toBeUndefined()

      await waitForAnalysis()
      expect(getRecordedPayload()).toEqual(
        expect.objectContaining({
          status: 'complete',
          estimatedBytes: bytes.byteLength,
        })
      )
    })

    it('does not read ahead of the consumer', async () => {
      const bytes = Buffer.from(PAYLOAD)
      const { stream, getPulls } = createWebSource([
        bytes.subarray(0, 10),
        bytes.subarray(10),
      ])
      const reader = tap(stream).getReader()
      await waitForAnalysis()
      expect(getPulls()).toBe(0)
      await reader.read()
      expect(getPulls()).toBe(1)
      reader.releaseLock()
    })

    it('forwards source errors and records an incomplete payload', async () => {
      const error = new Error('source failed')
      let sent = false
      const source = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true
            controller.enqueue(Buffer.from(PAYLOAD))
          } else {
            controller.error(error)
          }
        },
      })
      await expect(readWeb(tap(source))).rejects.toBe(error)
      await waitForAnalysis()
      // Only the received rows are counted, without a breakdown.
      expect(getRecordedPayload()).toEqual({
        status: 'incomplete',
        estimatedBytes: Buffer.byteLength(PAYLOAD),
      })
    })

    it('forwards cancellation to the source', async () => {
      const cancel = jest.fn()
      const source = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(Buffer.from(PAYLOAD_ROWS[0]))
        },
        cancel,
      })
      const reader = tap(source).getReader()
      await reader.read()
      await reader.cancel('client went away')
      expect(cancel).toHaveBeenCalledWith('client went away')
      await waitForAnalysis()
      expect(getRecordedPayload()?.status).toBe('incomplete')
    })

    it('keeps the response intact when the analyzer fails', async () => {
      jest
        .spyOn(RscPayloadAnalyzer.prototype, 'write')
        .mockImplementation(() => {
          throw new Error('analyzer failed')
        })
      const bytes = Buffer.from(PAYLOAD)
      const { stream } = createWebSource([bytes])
      const forwarded = await readWeb(tap(stream))
      expect(Buffer.concat(forwarded).equals(bytes)).toBe(true)
      await waitForAnalysis()
      expect(getRecordedPayload()).toEqual({
        status: 'unavailable',
        unavailableReason: 'parse-error',
      })
    })
  })

  describe('node streams', () => {
    it('forwards split chunks unchanged and records the payload after the end', async () => {
      const bytes = Buffer.from(PAYLOAD)
      const chunks = [
        bytes.subarray(0, 7),
        bytes.subarray(7, 40),
        bytes.subarray(40),
      ]
      const { stream } = createNodeSource(chunks)
      const tapped = tap(stream)

      const forwarded = await readNode(tapped)
      expect(Buffer.concat(forwarded).equals(bytes)).toBe(true)
      await waitForAnalysis()
      expect(getRecordedPayload()).toEqual(
        expect.objectContaining({
          status: 'complete',
          estimatedBytes: bytes.byteLength,
        })
      )
    })

    it('includes chunks that were buffered before the tap was installed', async () => {
      // React often writes most of a Flight response before it is wrapped.
      const source = new Readable({ read() {} })
      source.push(Buffer.from(PAYLOAD_ROWS[0]))
      const tapped = tap(source)
      source.push(Buffer.from(PAYLOAD_ROWS[1]))
      source.push(null)
      const forwarded = await readNode(tapped)
      expect(Buffer.concat(forwarded).toString()).toBe(PAYLOAD)
      await waitForAnalysis()
      expect(getRecordedPayload()).toEqual(
        expect.objectContaining({
          status: 'complete',
          estimatedBytes: Buffer.byteLength(PAYLOAD),
        })
      )
    })

    it('observes chunks read with read() in paused mode', async () => {
      const source = new Readable({ read() {} })
      source.push(Buffer.from(PAYLOAD))
      source.push(null)
      const tapped = tap(source)
      await new Promise((resolve) => tapped.once('readable', resolve))
      const chunks: Buffer[] = []
      let chunk: Buffer | null
      while ((chunk = tapped.read()) !== null) {
        chunks.push(chunk)
      }
      await new Promise((resolve) => tapped.once('end', resolve))
      expect(Buffer.concat(chunks).toString()).toBe(PAYLOAD)
      await waitForAnalysis()
      expect(getRecordedPayload()?.status).toBe('complete')
    })

    it('does not read ahead of the consumer', async () => {
      const bytes = Buffer.from(PAYLOAD)
      const { stream, getReads } = createNodeSource([
        bytes.subarray(0, 10),
        bytes.subarray(10),
      ])
      const baseline = createNodeSource([bytes])
      const tapped = tap(stream)
      await waitForAnalysis()
      // Observing the stream must not start reading it.
      expect(getReads()).toBe(baseline.getReads())
      expect(tapped.readableFlowing).toBe(null)
    })

    it('copies chunks so later mutation does not change the result', async () => {
      const bytes = Buffer.from(PAYLOAD)
      const { stream } = createNodeSource([bytes])
      const forwarded = await readNode(tap(stream))
      forwarded[0].fill(0x20)
      await waitForAnalysis()
      expect(getRecordedPayload()?.status).toBe('complete')
    })

    it('forwards source errors and records an incomplete payload', async () => {
      const error = new Error('source failed')
      let sent = false
      const source = new Readable({
        read() {
          if (!sent) {
            sent = true
            this.push(Buffer.from(PAYLOAD))
          } else {
            this.destroy(error)
          }
        },
      })
      await expect(readNode(tap(source))).rejects.toBe(error)
      await waitForAnalysis()
      expect(getRecordedPayload()).toEqual({
        status: 'incomplete',
        estimatedBytes: Buffer.byteLength(PAYLOAD),
      })
    })

    it('records an incomplete payload when the consumer destroys the stream', async () => {
      let sent = false
      const source = new Readable({
        read() {
          // Send one chunk, then stay open without ending.
          if (!sent) {
            sent = true
            this.push(Buffer.from(PAYLOAD_ROWS[0]))
          }
        },
      })
      const tapped = tap(source)
      expect(tapped).toBe(source)
      await new Promise((resolve) => tapped.once('data', resolve))
      tapped.destroy()
      await new Promise((resolve) => tapped.once('close', resolve))
      await waitForAnalysis()
      expect(getRecordedPayload()?.status).toBe('incomplete')
    })

    it('keeps the response intact when the analyzer fails', async () => {
      jest
        .spyOn(RscPayloadAnalyzer.prototype, 'write')
        .mockImplementation(() => {
          throw new Error('analyzer failed')
        })
      const bytes = Buffer.from(PAYLOAD)
      const { stream } = createNodeSource([bytes])
      const forwarded = await readNode(tap(stream))
      expect(Buffer.concat(forwarded).equals(bytes)).toBe(true)
      await waitForAnalysis()
      expect(getRecordedPayload()).toEqual({
        status: 'unavailable',
        unavailableReason: 'parse-error',
      })
    })

    it('handles object-mode string chunks', async () => {
      const source = Readable.from(PAYLOAD_ROWS, { objectMode: true })
      const forwarded = await readNode(tap(source))
      expect(forwarded.join('')).toBe(PAYLOAD)
      await waitForAnalysis()
      expect(getRecordedPayload()?.estimatedBytes).toBe(
        Buffer.byteLength(PAYLOAD)
      )
    })
  })

  it('reports payloads over the analysis limit as unavailable', async () => {
    const bytes = Buffer.alloc(17 * 1024 * 1024, 0x20)
    const { stream } = createWebSource([bytes])
    await readWeb(tap(stream))
    await waitForAnalysis()
    expect(getRecordedPayload()).toEqual({
      status: 'unavailable',
      unavailableReason: 'too-large',
    })
  })

  it('returns the stream unchanged when Request Insights is disabled', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'false'
    const { stream } = createWebSource([])
    expect(tap(stream)).toBe(stream)
  })

  it('returns the stream unchanged outside of a regular request', () => {
    const { stream } = createWebSource([])
    expect(tapRscPayloadForRequestInsights(stream)).toBe(stream)
    expect(
      runWithRequestInsightsIdentity(
        { ...identity, kind: 'instant-insights' },
        () => tapRscPayloadForRequestInsights(stream)
      )
    ).toBe(stream)
  })
})
