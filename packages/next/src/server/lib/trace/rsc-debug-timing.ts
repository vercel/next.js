import type { RequestInsightRscTiming } from '../../../next-devtools/shared/request-insights'
import type { RequestInsightsIdentity } from './request-insights-identity'
import { recordRequestInsightRscTimings } from './request-insights'

const MAX_TIMING_ENTRIES = 500
const MAX_ROW_BYTES = 1024 * 1024

const ROW_ID = 0
const ROW_TAG = 1
const ROW_LENGTH = 2
const ROW_NEWLINE = 3
const ROW_CONTENT = 4

const MODEL_TIME = 1
const MODEL_COMPONENT = 2
const MODEL_AWAIT = 3
const MODEL_IO = 4

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

type RscTimingStream = AsyncIterable<Uint8Array | string>

type DebugModel = {
  kind: number
  time: number
  end: number
  name: string
  environment: string
  reference: number
}

type RowHandler = (id: number, tag: number, value: string) => void

/**
 * Development-only adapter for React's private Flight debug protocol.
 *
 * This intentionally does not attempt to be a general Flight decoder. It only
 * retains the timing, component, environment, and I/O name fields needed by
 * Request Insights. Protocol changes must fail open and never affect rendering.
 */
export async function collectRscDebugTimings(
  regularStream: RscTimingStream,
  debugStream: RscTimingStream
): Promise<RequestInsightRscTiming[]> {
  try {
    let timeOrigin: number | undefined
    let nextInlineModelId = -1
    const models = new Map<number, DebugModel>()
    const aliases = new Map<number, number>()
    const taskSequences = new Map<number, number[]>()

    const regularRows = new FlightRowDecoder((id, tag, value) => {
      if (tag !== 68) {
        return
      }

      const parsed = parseJson(value)
      const reference = parseReference(parsed)
      if (reference !== undefined) {
        appendTaskReference(taskSequences, id, reference)
        return
      }

      const model = sanitizeDebugModel(parsed, false)
      if (model) {
        const inlineModelId = nextInlineModelId--
        models.set(inlineModelId, model)
        appendTaskReference(taskSequences, id, inlineModelId)
      }
    })

    const debugRows = new FlightRowDecoder((id, tag, value) => {
      if (tag === 78) {
        const parsedTimeOrigin = Number(value)
        if (Number.isFinite(parsedTimeOrigin)) {
          timeOrigin = parsedTimeOrigin
        }
        return
      }

      const parsed = parseJson(value)
      if (tag === 74) {
        const ioModel = sanitizeDebugModel(parsed, true)
        if (ioModel?.kind === MODEL_IO) {
          models.set(id, ioModel)
        }
        return
      }

      if (tag !== 0) {
        return
      }

      const reference = parseReference(parsed)
      if (reference !== undefined) {
        aliases.set(id, reference)
        return
      }

      const model = sanitizeDebugModel(parsed, false)
      if (model) {
        models.set(id, model)
      }
    })

    await Promise.allSettled([
      drainStream(regularStream, regularRows),
      drainStream(debugStream, debugRows),
    ])

    if (timeOrigin === undefined) {
      return []
    }

    const timings: RequestInsightRscTiming[] = []
    for (const sequence of taskSequences.values()) {
      for (let index = 0; index + 2 < sequence.length; index++) {
        const start = resolveModel(sequence[index], models, aliases)
        const event = resolveModel(sequence[index + 1], models, aliases)
        const end = resolveModel(sequence[index + 2], models, aliases)

        if (
          start?.kind !== MODEL_TIME ||
          end?.kind !== MODEL_TIME ||
          end.time < start.time
        ) {
          continue
        }

        let kind: RequestInsightRscTiming['kind']
        let name: string
        let environment = event?.environment ?? ''

        if (event?.kind === MODEL_COMPONENT && event.name !== '') {
          kind = 'component'
          name = event.name
        } else if (event?.kind === MODEL_AWAIT) {
          const ioModel = resolveModel(event.reference, models, aliases)
          if (ioModel?.kind !== MODEL_IO || ioModel.name === '') {
            continue
          }
          kind = 'await'
          name = ioModel.name
          environment ||= ioModel.environment
        } else {
          continue
        }

        if (timings.length < MAX_TIMING_ENTRIES) {
          timings.push({
            name,
            environment,
            startTime: timeOrigin + start.time,
            durationMs: end.time - start.time,
            kind,
          })
        }
      }
    }

    return timings
  } catch {
    return []
  }
}

export async function collectAndRecordRscDebugTimings(
  identity: RequestInsightsIdentity,
  regularStream: RscTimingStream,
  debugStream: RscTimingStream
): Promise<void> {
  try {
    const timings = await collectRscDebugTimings(regularStream, debugStream)
    if (timings.length > 0) {
      recordRequestInsightRscTimings(identity, timings)
    }
  } catch {
    // Request Insights is observational. Collector failures must not render-fail.
  }
}

class FlightRowDecoder {
  private state = ROW_ID
  private id = 0
  private tag = 0
  private length = 0
  private byteLength = 0
  private dropping = false
  private chunks: Uint8Array[] = []
  private readonly onRow: RowHandler

  constructor(onRow: RowHandler) {
    this.onRow = onRow
  }

  push(chunk: Uint8Array): void {
    let offset = 0

    while (offset < chunk.length) {
      if (this.state === ROW_ID) {
        const byte = chunk[offset++]
        if (byte === 58) {
          this.state = ROW_TAG
        } else {
          const digit = fromHex(byte)
          if (digit === -1) {
            this.startDroppingNewlineRow()
          } else {
            this.id = (this.id << 4) | digit
          }
        }
        continue
      }

      if (this.state === ROW_TAG) {
        const byte = chunk[offset]
        if (isLengthPrefixedTag(byte)) {
          this.tag = byte
          this.state = ROW_LENGTH
          this.dropping = true
          offset++
        } else if (isTaggedNewlineRow(byte)) {
          this.tag = byte
          this.state = ROW_NEWLINE
          offset++
        } else {
          this.tag = 0
          this.state = ROW_NEWLINE
        }
        continue
      }

      if (this.state === ROW_LENGTH) {
        const byte = chunk[offset++]
        if (byte === 44) {
          this.state = ROW_CONTENT
        } else {
          const digit = fromHex(byte)
          if (digit === -1) {
            this.startDroppingNewlineRow()
          } else {
            this.length = (this.length << 4) | digit
          }
        }
        continue
      }

      if (this.state === ROW_NEWLINE) {
        const end = chunk.indexOf(10, offset)
        if (end === -1) {
          this.append(chunk.subarray(offset))
          return
        }
        this.append(chunk.subarray(offset, end))
        this.emitRow()
        offset = end + 1
        continue
      }

      const remaining = this.length - this.byteLength
      const take = Math.min(remaining, chunk.length - offset)
      this.append(chunk.subarray(offset, offset + take))
      offset += take
      if (this.byteLength === this.length) {
        this.emitRow()
      }
    }
  }

  private append(chunk: Uint8Array): void {
    if (chunk.length === 0) {
      return
    }

    this.byteLength += chunk.length
    if (!this.dropping && this.byteLength <= MAX_ROW_BYTES) {
      this.chunks.push(chunk.slice())
    } else {
      this.dropping = true
      this.chunks.length = 0
    }
  }

  private emitRow(): void {
    if (!this.dropping) {
      const bytes = concatChunks(this.chunks, this.byteLength)
      try {
        this.onRow(this.id, this.tag, textDecoder.decode(bytes))
      } catch {
        // A malformed private-protocol row is ignored.
      }
    }
    this.reset()
  }

  private startDroppingNewlineRow(): void {
    this.state = ROW_NEWLINE
    this.dropping = true
    this.chunks.length = 0
    this.byteLength = 0
  }

  private reset(): void {
    this.state = ROW_ID
    this.id = 0
    this.tag = 0
    this.length = 0
    this.byteLength = 0
    this.dropping = false
    this.chunks.length = 0
  }
}

async function drainStream(
  stream: RscTimingStream,
  decoder: FlightRowDecoder
): Promise<void> {
  for await (const chunk of stream) {
    decoder.push(typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk)
  }
}

function sanitizeDebugModel(value: unknown, isIo: boolean): DebugModel | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const model = value as Record<string, unknown>
  const environment =
    typeof model.env === 'string' ? model.env.slice(0, 200) : ''

  if (isIo) {
    if (
      typeof model.name !== 'string' ||
      typeof model.start !== 'number' ||
      typeof model.end !== 'number' ||
      !Number.isFinite(model.start) ||
      !Number.isFinite(model.end)
    ) {
      return null
    }
    return createDebugModel(
      MODEL_IO,
      model.start,
      model.end,
      model.name.slice(0, 200),
      environment,
      -1
    )
  }

  if (typeof model.time === 'number' && Number.isFinite(model.time)) {
    return createDebugModel(MODEL_TIME, model.time, model.time, '', '', -1)
  }

  if (typeof model.name === 'string') {
    return createDebugModel(
      MODEL_COMPONENT,
      0,
      0,
      model.name.slice(0, 200),
      environment,
      -1
    )
  }

  const awaitedReference = parseReference(model.awaited)
  if (awaitedReference !== undefined) {
    return createDebugModel(
      MODEL_AWAIT,
      0,
      0,
      '',
      environment,
      awaitedReference
    )
  }

  return null
}

function createDebugModel(
  kind: number,
  time: number,
  end: number,
  name: string,
  environment: string,
  reference: number
): DebugModel {
  return { kind, time, end, name, environment, reference }
}

function appendTaskReference(
  taskSequences: Map<number, number[]>,
  taskId: number,
  reference: number
): void {
  let sequence = taskSequences.get(taskId)
  if (!sequence) {
    sequence = []
    taskSequences.set(taskId, sequence)
  }
  sequence.push(reference)
}

function resolveModel(
  reference: number,
  models: Map<number, DebugModel>,
  aliases: Map<number, number>
): DebugModel | undefined {
  let current = reference
  for (let depth = 0; depth < 20; depth++) {
    const model = models.get(current)
    if (model) {
      return model
    }
    const alias = aliases.get(current)
    if (alias === undefined) {
      return undefined
    }
    current = alias
  }
  return undefined
}

function parseReference(value: unknown): number | undefined {
  if (typeof value !== 'string' || value[0] !== '$') {
    return undefined
  }

  let offset = 1
  if (value[offset] === '@') {
    offset++
  }
  const separator = value.indexOf(':', offset)
  const reference = Number.parseInt(
    separator === -1 ? value.slice(offset) : value.slice(offset, separator),
    16
  )
  return Number.isFinite(reference) ? reference : undefined
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function concatChunks(chunks: Uint8Array[], byteLength: number): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0]
  }

  const result = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function fromHex(byte: number): number {
  if (byte >= 48 && byte <= 57) return byte - 48
  if (byte >= 97 && byte <= 102) return byte - 87
  if (byte >= 65 && byte <= 70) return byte - 55
  return -1
}

function isTaggedNewlineRow(tag: number): boolean {
  return (tag >= 65 && tag <= 90) || tag === 35 || tag === 114 || tag === 120
}

function isLengthPrefixedTag(tag: number): boolean {
  return (
    tag === 84 ||
    tag === 65 ||
    tag === 79 ||
    tag === 111 ||
    tag === 98 ||
    tag === 85 ||
    tag === 83 ||
    tag === 115 ||
    tag === 76 ||
    tag === 108 ||
    tag === 71 ||
    tag === 103 ||
    tag === 77 ||
    tag === 109 ||
    tag === 86
  )
}
