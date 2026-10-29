import type { Attributes, HrTime, Span } from '@opentelemetry/api'

const api =
  require('next/dist/compiled/@opentelemetry/api') as typeof import('next/dist/compiled/@opentelemetry/api') as unknown as typeof import('@opentelemetry/api')
const { ROOT_CONTEXT, SpanStatusCode, trace } = api

import type { TraceEvent } from './types'

// Bounds apply to early replay and concurrently live reporting records, not to
// local diagnostics. Completed records release attributes after registration.
export const REPLAY_EVENT_LIMIT = 10_000
export const REPLAY_BYTE_LIMIT = 8 * 1024 * 1024
export const FLUSH_TIMEOUT_MS = 5_000

export type ReportingRecord = {
  id: number
  parentId?: number
  name: string
  start: HrTime
  end?: HrTime
  attributes: Attributes
  parent?: ReportingRecord
  span?: Span
  retained: boolean
  size: number
}

let ready = false
let suppressed = false
let warned = false
let retainedCount = 0
let retainedBytes = 0
let defaultParentId: number | undefined
let defaultParent: ReportingRecord | undefined
let flushHook: (() => void | Promise<void>) | undefined
const live = new Map<number, ReportingRecord>()
const pending = new Map<number, ReportingRecord>()

function warnLoss() {
  if (!warned) {
    warned = true
    console.warn(
      'Next.js tooling OTel replay limit reached or reporting failed; some external spans may be missing. Local trace files are unaffected.'
    )
  }
}

export function otelAttributes(tags: Record<string, unknown>): Attributes {
  const attributes: Attributes = {}
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === null) continue
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      attributes[key] = value
    } else {
      try {
        attributes[key] = JSON.stringify(value)
      } catch {
        attributes[key] = String(value)
      }
    }
  }
  return attributes
}

function sizeOf(name: string, attributes: Attributes) {
  return (
    128 +
    Buffer.byteLength(name) +
    Buffer.byteLength(JSON.stringify(attributes))
  )
}

function release(record: ReportingRecord) {
  if (record.retained) {
    record.retained = false
    retainedCount--
    retainedBytes -= record.size
  }
  record.attributes = {}
  record.parent = undefined
  live.delete(record.id)
}

function open(record: ReportingRecord): Span | undefined {
  if (record.span) return record.span
  if (!record.retained) return undefined
  try {
    const parent = record.parent ? open(record.parent) : undefined
    const context = parent ? trace.setSpan(ROOT_CONTEXT, parent) : ROOT_CONTEXT
    record.span = trace.getTracer('next.js.tooling').startSpan(
      record.name,
      {
        startTime: record.start,
        attributes: {
          // Correlation must survive the application's SDK attribute limit.
          // Legacy tags can number in the hundreds on compilation spans.
          'next.tooling.id': record.id,
          ...(record.parentId === undefined
            ? {}
            : { 'next.tooling.parent_id': record.parentId }),
          ...record.attributes,
        },
      },
      context
    )
    if (record.end) finish(record)
    return record.span
  } catch {
    warnLoss()
    release(record)
    return undefined
  }
}

function finish(record: ReportingRecord) {
  try {
    if (record.attributes.failed === true) {
      record.span?.setStatus({ code: SpanStatusCode.ERROR })
    }
    record.span?.setAttributes(record.attributes)
    record.span?.end(record.end)
  } catch {
    warnLoss()
  } finally {
    release(record)
  }
}

export function startReporting(
  id: number,
  parentId: number | undefined,
  name: string,
  start: HrTime,
  tags: Record<string, unknown>,
  parent?: ReportingRecord,
  deferOpen = false
): ReportingRecord | undefined {
  if (suppressed) return undefined
  const attributes = otelAttributes(tags)
  const size = sizeOf(name, attributes)
  if (
    retainedCount >= REPLAY_EVENT_LIMIT ||
    retainedBytes + size > REPLAY_BYTE_LIMIT
  ) {
    warnLoss()
    return undefined
  }
  const record: ReportingRecord = {
    id,
    parentId,
    name,
    start,
    attributes,
    parent:
      parent ??
      live.get(parentId!) ??
      pending.get(parentId!) ??
      (parentId === undefined ? undefined : defaultParent),
    retained: true,
    size,
  }
  retainedCount++
  retainedBytes += size
  live.set(id, record)
  if (id === defaultParentId) defaultParent = record
  if (ready) {
    if (!deferOpen) open(record)
  } else {
    pending.set(id, record)
  }
  return record
}

export function endReporting(record: ReportingRecord | undefined, end: HrTime) {
  if (!record?.retained) return
  record.end = end
  live.delete(record.id)
  if (ready) finish(record)
}

export function updateReporting(
  record: ReportingRecord | undefined,
  key: string,
  value: unknown
) {
  if (!record?.retained) return
  const attributes = {
    ...record.attributes,
    ...otelAttributes({ [key]: value }),
  }
  const size = sizeOf(record.name, attributes)
  if (retainedBytes - record.size + size > REPLAY_BYTE_LIMIT) {
    warnLoss()
    return
  }
  retainedBytes += size - record.size
  record.size = size
  record.attributes = attributes
}

export function configureReporting(
  parentId: number | undefined,
  worker: boolean
) {
  defaultParentId = parentId
  defaultParent = live.get(parentId!) ?? pending.get(parentId!)
  suppressed = worker
  if (worker) {
    for (const record of pending.values()) release(record)
    pending.clear()
  }
}

export function replayCompleted(
  events: TraceEvent[],
  timing: (event: TraceEvent) => { start: HrTime; end: HrTime }
) {
  const records = new Map<number, ReportingRecord>()
  for (const event of events) {
    const { start, end } = timing(event)
    const record = startReporting(
      event.id,
      event.parentId,
      event.name,
      start,
      event.tags ?? {},
      undefined,
      true
    )
    if (record) {
      record.end = end
      records.set(event.id, record)
      live.delete(event.id)
    }
  }
  // Worker arrays are in completion order, not tree order. Resolve the entire
  // batch before opening any span so children use the real coordinator tree.
  for (const record of records.values()) {
    record.parent = records.get(record.parentId!) ?? record.parent
  }
  if (ready) {
    for (const record of records.values()) open(record)
  }
}

export function enableReporting(hook?: () => void | Promise<void>) {
  if (ready || suppressed) return
  ready = true
  flushHook = hook
  for (const record of pending.values()) open(record)
  pending.clear()
}

export async function flushReporting() {
  if (!ready || !flushHook) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve().then(flushHook),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), FLUSH_TIMEOUT_MS)
      }),
    ])
  } catch {
    console.warn(
      'Next.js tooling instrumentation.flushTraces() failed or timed out; local traces have already been flushed.'
    )
  } finally {
    clearTimeout(timer)
  }
}
