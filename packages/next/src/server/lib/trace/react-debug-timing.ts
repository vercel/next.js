export type ReactTimingRecord = {
  id: string
  kind: 'component' | 'await'
  name: string
  environment: string
  ownerName?: string
  componentPath?: string
  source?: ReactTimingSource
  startTime: number
  durationMs: number
}

export type ReactTimingIncompleteReason = 'budget' | 'protocol'

type ReactTimingSource = {
  file: string
  methodName: string
  line: number
  column: number
}

const MAX_ROW_BYTES = 1024 * 1024
const MAX_MODELS = 2000
const MAX_TASKS = 1000
const MAX_REFERENCES = 8000
const MAX_STREAM_BYTES = 8 * 1024 * 1024

type DebugModel =
  | { kind: 'time'; time: number }
  | {
      kind: 'component' | 'io'
      name: string
      environment: string
      owner?: number
      source?: ReactTimingSource
    }
  | {
      kind: 'await'
      reference: number
      environment: string
      owner?: number
      source?: ReactTimingSource
    }
  | { kind: 'reference'; reference: number }
  | { kind: 'other' }

type Task = { references: number[]; cursor: number; time: number | undefined }
type RowHandler = (id: number, tag: number, value: string) => void

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Observes React's development Flight debug protocol without reading ahead on
 * either stream. Component records describe timed render intervals, not the
 * inclusive lifetime of a component and its descendants.
 */
export function createReactTimingCollector(
  onTimings: (timings: ReactTimingRecord[]) => void,
  onTruncated?: (reason: ReactTimingIncompleteReason) => void
) {
  let closed = false
  let scheduled = false
  let dirty = false
  let truncated = false
  let timeOrigin: number | undefined
  let nextInlineId = -1
  let referenceCount = 0
  let flightBytes = 0
  let debugBytes = 0
  const models = new Map<number, DebugModel>()
  const tasks = new Map<number, Task>()

  function markTruncated(reason: ReactTimingIncompleteReason = 'budget') {
    if (truncated) return
    truncated = true
    try {
      onTruncated?.(reason)
    } catch {
      // A diagnostic callback must not interrupt the stream being observed.
    }
  }

  function retainModel(id: number, model: DebugModel) {
    if (models.size < MAX_MODELS || models.has(id)) {
      models.set(id, model)
      dirty = true
    } else {
      markTruncated()
    }
  }

  function retainReference(id: number, reference: number) {
    if (referenceCount >= MAX_REFERENCES) {
      markTruncated()
      return
    }
    let task = tasks.get(id)
    if (!task) {
      if (tasks.size >= MAX_TASKS) {
        markTruncated()
        return
      }
      task = { references: [], cursor: 0, time: undefined }
      tasks.set(id, task)
    }
    task.references.push(reference)
    referenceCount++
    dirty = true
  }

  function readOrigin(value: string) {
    const origin = Number(value)
    if (timeOrigin === undefined && value !== '' && Number.isFinite(origin)) {
      timeOrigin = origin
      dirty = true
    }
  }

  const flightRows = new FlightRowDecoder(
    (id, tag, value) => {
      if (tag === 78) {
        readOrigin(value)
      } else if (tag === 68) {
        const parsed = parseJson(value)
        const reference = parseReference(parsed)
        if (reference !== undefined) {
          retainReference(id, reference)
        } else {
          const inlineId = nextInlineId--
          retainModel(inlineId, sanitizeModel(parsed, false))
          retainReference(id, inlineId)
        }
      }
    },
    true,
    markTruncated
  )

  const debugRows = new FlightRowDecoder(
    (id, tag, value) => {
      if (tag === 78) {
        readOrigin(value)
      } else if (tag === 0 || tag === 74) {
        retainModel(id, sanitizeModel(parseJson(value), tag === 74))
      }
    },
    false,
    markTruncated
  )

  function flush(final = false) {
    scheduled = false
    dirty = false
    if (closed || timeOrigin === undefined) return

    const batch: ReactTimingRecord[] = []
    for (const [id, task] of tasks) {
      while (task.cursor < task.references.length) {
        const index = task.cursor
        const event = resolveModel(task.references[index], models)
        if (!event) {
          if (!final) break
          markTruncated('protocol')
          task.time = undefined
          task.cursor++
          continue
        }
        if (event.kind === 'time') {
          task.time = event.time
          task.cursor++
          continue
        }
        if (event.kind !== 'component' && event.kind !== 'await') {
          task.cursor++
          continue
        }
        const operation =
          event.kind === 'await' ? resolveModel(event.reference, models) : event
        let nextIndex = index + 1
        let end = resolveModel(task.references[nextIndex], models)
        // Await records can share a task interval with a component or another
        // await. Only timestamps delimit waits; a component also ends when the
        // next component starts at the same task time.
        while (
          end?.kind === 'other' ||
          end?.kind === 'await' ||
          (event.kind === 'await' && end?.kind === 'component')
        ) {
          end = resolveModel(task.references[++nextIndex], models)
        }
        if (!final && (!end || !operation)) break
        let endTime: number | undefined
        if (end?.kind === 'time') {
          endTime = end.time
        } else if (event.kind === 'component' && end?.kind === 'component') {
          // React omits the next component's start marker when its clock has
          // not advanced. The preceding interval ends at the current task time.
          endTime = task.time
        }
        if (
          task.time === undefined ||
          endTime === undefined ||
          endTime < task.time ||
          (operation?.kind !== 'component' && operation?.kind !== 'io') ||
          (event.kind === 'await' && operation.kind !== 'io')
        ) {
          markTruncated('protocol')
          task.cursor++
          continue
        }

        const startTime = timeOrigin + task.time
        const durationMs = endTime - task.time
        if (
          !Number.isFinite(startTime) ||
          !Number.isFinite(durationMs) ||
          operation.name === ''
        ) {
          task.cursor++
          continue
        }
        const ownerReference = event.kind === 'await' ? event.owner : undefined
        const owner =
          ownerReference === undefined
            ? undefined
            : resolveModel(ownerReference, models)
        if (!final && !truncated && ownerReference !== undefined && !owner) {
          break
        }
        const componentPath = getComponentPath(
          event,
          models,
          final || truncated
        )
        if (componentPath === undefined) break
        task.cursor++
        batch.push({
          id: `${id.toString(16)}:${index - 1}`,
          kind: event.kind,
          name: operation.name,
          environment: event.environment || operation.environment,
          startTime,
          durationMs,
          ...(event.source ? { source: event.source } : {}),
          ...(componentPath ? { componentPath } : {}),
          ...(owner?.kind === 'component' && owner.name
            ? { ownerName: owner.name }
            : {}),
        })
      }
    }
    if (batch.length > 0) {
      try {
        onTimings(batch)
      } catch {
        // Recording must not fail the render or schedule an uncaught exception.
        abort()
      }
    }
  }

  function read(chunk: Uint8Array | string, debug: boolean) {
    if (closed) return
    try {
      const used = debug ? debugBytes : flightBytes
      if (used >= MAX_STREAM_BYTES) {
        markTruncated()
        return
      }
      const bytes =
        typeof chunk === 'string'
          ? textEncoder.encode(chunk.slice(0, MAX_STREAM_BYTES - used))
          : chunk
      const length = Math.min(bytes.byteLength, MAX_STREAM_BYTES - used)
      if (bytes.byteLength > length || chunk.length > MAX_STREAM_BYTES - used) {
        markTruncated()
      }
      if (debug) debugBytes += length
      else flightBytes += length
      const rows = debug ? debugRows : flightRows
      rows.push(bytes.subarray(0, length))
      if (dirty && !scheduled) {
        dirty = false
        scheduled = true
        queueMicrotask(flush)
      }
    } catch {
      markTruncated('protocol')
      abort()
    }
  }

  function abort() {
    closed = true
    models.clear()
    tasks.clear()
    flightRows.clear()
    debugRows.clear()
  }

  return {
    readFlightChunk(chunk: Uint8Array | string) {
      read(chunk, false)
    },
    readDebugChunk(chunk: Uint8Array | string) {
      read(chunk, true)
    },
    finish() {
      flush(true)
      abort()
    },
    abort,
  }
}

class FlightRowDecoder {
  private state: 'id' | 'tag' | 'length' | 'line' | 'content' = 'id'
  private id = 0
  private tag = 0
  private length = 0
  private byteLength = 0
  private dropping = false
  private buffer: Uint8Array | null = null
  private atStart = true

  constructor(
    private readonly onRow: RowHandler,
    private readonly flight: boolean,
    private readonly onTruncated: () => void
  ) {}

  push(chunk: Uint8Array) {
    let offset = 0
    while (offset < chunk.length) {
      if (this.state === 'id') {
        const byte = chunk[offset++]
        if (this.atStart && this.flight && (byte === 35 || byte === 126)) {
          this.atStart = false
          continue
        }
        this.atStart = false
        if (byte === 58) {
          this.state = 'tag'
        } else {
          const digit = fromHex(byte)
          const id = this.id * 16 + digit
          if (digit === -1 || !Number.isSafeInteger(id)) {
            this.state = 'line'
            this.dropping = true
          } else {
            this.id = id
          }
        }
        continue
      }
      if (this.state === 'tag') {
        const byte = chunk[offset]
        if (isLengthPrefixedTag(byte)) {
          this.state = 'length'
          this.dropping = true
          offset++
        } else {
          this.state = 'line'
          if (
            (byte >= 65 && byte <= 90) ||
            byte === 35 ||
            byte === 114 ||
            byte === 120
          ) {
            this.tag = byte
            offset++
          }
          this.dropping = this.flight
            ? this.tag !== 68 && this.tag !== 78
            : this.tag !== 0 && this.tag !== 74 && this.tag !== 78
        }
        continue
      }
      if (this.state === 'length') {
        const byte = chunk[offset++]
        if (byte === 44) {
          this.state = 'content'
          if (this.length === 0) this.emitRow()
        } else {
          const digit = fromHex(byte)
          const length = this.length * 16 + digit
          if (digit === -1 || !Number.isSafeInteger(length)) {
            this.state = 'line'
          } else {
            this.length = length
          }
        }
        continue
      }
      if (this.state === 'line') {
        const end = chunk.indexOf(10, offset)
        if (end === -1) {
          this.append(chunk.subarray(offset))
          return
        }
        const row = chunk.subarray(offset, end)
        if (this.byteLength === 0 && row.byteLength <= MAX_ROW_BYTES) {
          this.emitRow(row)
        } else {
          this.append(row)
          this.emitRow()
        }
        offset = end + 1
        continue
      }
      const take = Math.min(
        this.length - this.byteLength,
        chunk.length - offset
      )
      this.byteLength += take
      offset += take
      if (this.byteLength === this.length) this.emitRow()
    }
  }

  clear() {
    this.buffer = null
  }

  private append(chunk: Uint8Array) {
    if (chunk.byteLength === 0) return
    const offset = this.byteLength
    this.byteLength += chunk.byteLength
    if (!this.dropping && this.byteLength <= MAX_ROW_BYTES) {
      if (!this.buffer || this.buffer.byteLength < this.byteLength) {
        const buffer = new Uint8Array(
          Math.min(
            MAX_ROW_BYTES,
            Math.max(1024, (this.buffer?.byteLength ?? 0) * 2, this.byteLength)
          )
        )
        if (this.buffer) buffer.set(this.buffer.subarray(0, offset))
        this.buffer = buffer
      }
      this.buffer.set(chunk, offset)
    } else {
      if (!this.dropping) this.onTruncated()
      this.dropping = true
      this.clear()
    }
  }

  private emitRow(row = this.buffer?.subarray(0, this.byteLength)) {
    if (!this.dropping) {
      this.onRow(this.id, this.tag, textDecoder.decode(row))
    }
    this.clear()
    this.state = 'id'
    this.id = 0
    this.tag = 0
    this.length = 0
    this.byteLength = 0
    this.dropping = false
  }
}

function sanitizeModel(value: unknown, io: boolean): DebugModel {
  const reference = parseReference(value)
  if (reference !== undefined) return { kind: 'reference', reference }
  if (typeof value !== 'object' || value === null) return { kind: 'other' }
  const model = value as Record<string, unknown>
  const environment =
    typeof model.env === 'string' ? model.env.slice(0, 200) : ''
  if (!io && typeof model.time === 'number' && Number.isFinite(model.time)) {
    return { kind: 'time', time: model.time }
  }
  if (typeof model.name === 'string') {
    return {
      kind: io ? 'io' : 'component',
      name: model.name.slice(0, 200),
      environment,
      owner: parseReference(model.owner),
      ...(!io ? { source: sanitizeSource(model.stack) } : {}),
    }
  }
  const awaited = parseReference(model.awaited)
  return !io && awaited !== undefined
    ? {
        kind: 'await',
        reference: awaited,
        environment,
        owner: parseReference(model.owner),
        source: sanitizeSource(model.stack),
      }
    : { kind: 'other' }
}

function sanitizeSource(value: unknown): ReactTimingSource | undefined {
  if (!Array.isArray(value) || !Array.isArray(value[0])) return
  const [methodName, file, line, column] = value[0]
  if (
    typeof methodName === 'string' &&
    methodName.length <= 200 &&
    typeof file === 'string' &&
    file.length > 0 &&
    file.length <= 2048 &&
    !/[\r\n\0]/.test(file) &&
    !file.startsWith('$') &&
    Number.isSafeInteger(line) &&
    line > 0 &&
    Number.isSafeInteger(column) &&
    column > 0
  ) {
    return { methodName, file, line, column }
  }
}

function resolveModel(id: number, models: Map<number, DebugModel>) {
  for (let depth = 0; depth < 20; depth++) {
    const model = models.get(id)
    if (model?.kind !== 'reference') return model
    id = model.reference
  }
  return undefined
}

function getComponentPath(
  event: Extract<DebugModel, { kind: 'component' | 'io' | 'await' }>,
  models: Map<number, DebugModel>,
  final: boolean
): string | undefined {
  if (event.owner === undefined) return ''
  const names = event.kind === 'component' ? [event.name] : []
  const seen = new Set<DebugModel>([event])
  let ownerId = event.owner
  let length = names[0]?.length ?? 0
  while (true) {
    const owner = resolveModel(ownerId, models)
    if (!owner && !final) return undefined
    if (
      owner?.kind !== 'component' ||
      seen.has(owner) ||
      names.length >= 20 ||
      length + (owner.name || 'Anonymous').length + 7 > 1024
    ) {
      names.push('…')
      break
    }
    seen.add(owner)
    names.push(owner.name || 'Anonymous')
    length += (owner.name || 'Anonymous').length + 3
    if (owner.owner === undefined) break
    ownerId = owner.owner
  }
  return names.reverse().join(' › ')
}

function parseReference(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\$@?[\da-f]+$/i.test(value)) return
  const reference = Number.parseInt(value.slice(value[1] === '@' ? 2 : 1), 16)
  return Number.isSafeInteger(reference) ? reference : undefined
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function fromHex(byte: number) {
  if (byte >= 48 && byte <= 57) return byte - 48
  if (byte >= 97 && byte <= 102) return byte - 87
  if (byte >= 65 && byte <= 70) return byte - 55
  return -1
}

function isLengthPrefixedTag(tag: number) {
  return 'TAOoUbSsLlGgMmV'.includes(String.fromCharCode(tag))
}
