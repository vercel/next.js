import type { Attributes, HrTime, Span, SpanContext } from '@opentelemetry/api'
import type { TraceEvent } from './types'

// Accounting bounds for centrally retained metadata and UTF-16 snapshots, not
// exact heap limits. Local traces, caller-held context tokens and SDK memory are
// independent. Reserve one slot and 512 bytes for the explicitly captured root.
export const REPLAY_EVENT_LIMIT = 10_000
export const REPLAY_BYTE_LIMIT = 8 * 1024 * 1024
export const FLUSH_TIMEOUT_MS = 5_000
const ROOT_BYTES = 512
const TURN_RECORDS = 64
const TURN_MS = 4

export type ReportingRecord = {
  id: number
  parentId?: number
  name: string
  // Epoch nanoseconds, derived from the shared monotonic clock offset.
  start: bigint
  end?: bigint
  failed?: boolean
  encoded?: string
  parent?: ReportingRecord
  span?: Span
  context?: SpanContext
  retained: boolean
  size: number
  generation: number
}

type State = 'unregistered' | 'ready' | 'finalizing' | 'closed'
let state: State = 'unregistered'
// Resolve once, lazily inside the consumer; repeated module resolution is
// significant on per-module workloads even though Node caches the module.
let api: typeof import('@opentelemetry/api') | undefined
let generation = 0
let suppressed = false
let warned = false
let retainedBytes = 0
let defaultParent: ReportingRecord | undefined
let flushHook: (() => void | Promise<void>) | undefined
let scheduled: ReturnType<typeof setImmediate> | undefined
let finalization: Promise<void> | undefined
let deadline = Infinity
let drained: (() => void) | undefined
const records = new Map<number, ReportingRecord>()
const openings = new Set<ReportingRecord>()
const terminals = new Set<ReportingRecord>()
// One iterative traversal, retained across turns. Ancestors count toward the
// same turn budget as children; deep worker trees never recurse on the JS stack.
const stack: ReportingRecord[] = []
const visiting = new Set<ReportingRecord>()

function warnLoss() {
  if (!warned) {
    warned = true
    console.warn(
      'Next.js tooling OTel reporting limit reached or reporting failed; some external spans or attributes may be missing. Local trace files are unaffected.'
    )
  }
}

function attributes(encoded: string | undefined): Attributes {
  const result: Attributes = {}
  if (!encoded) return result
  const tags = JSON.parse(encoded) as Record<string, unknown>
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === null) continue
    result[key] =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? value
        : JSON.stringify(value)
  }
  return result
}

function time(ns: bigint): HrTime {
  return [
    Number(ns / BigInt(1_000_000_000)),
    Number(ns % BigInt(1_000_000_000)),
  ]
}

function release(record: ReportingRecord) {
  if (record.retained) {
    record.retained = false
    retainedBytes -= record.size
    if (records.get(record.id) === record) records.delete(record.id)
  }
  openings.delete(record)
  terminals.delete(record)
  record.name = ''
  record.encoded = undefined
  record.span = undefined
  record.parent = undefined
  record.size = 0
  // Only the small identity/context token survives through direct local handles.
}

function clearWork() {
  clearImmediate(scheduled)
  scheduled = undefined
  for (const record of records.values()) release(record)
  stack.length = 0
  visiting.clear()
  drained?.()
  drained = undefined
}

function newRoot() {
  generation++
  clearWork()
  defaultParent = undefined
  flushHook = undefined
  finalization = undefined
  state = 'unregistered'
  warned = false
  deadline = Infinity
}

function requestDrain() {
  if (scheduled || suppressed || (state !== 'ready' && state !== 'finalizing'))
    return
  const current = generation
  scheduled = setImmediate(() => {
    scheduled = undefined
    if (current === generation) consume()
  })
}

function canEmit(record: ReportingRecord) {
  return (
    record.retained &&
    record.generation === generation &&
    (state === 'ready' || state === 'finalizing') &&
    performance.now() < deadline
  )
}

// This is the only bridge-owned API/SDK entry point. Loading the API, sampling,
// processors, context construction and attribute normalization all happen here,
// never in a producer or instrumentation-registration stack.
function emit(record: ReportingRecord) {
  try {
    const { ROOT_CONTEXT, SpanStatusCode, trace } = (api ??=
      require('next/dist/compiled/@opentelemetry/api') as typeof import('next/dist/compiled/@opentelemetry/api') as unknown as typeof import('@opentelemetry/api'))
    const tags =
      record.end === undefined ? undefined : attributes(record.encoded)
    const alreadyStarted = !!record.span
    if (!record.span) {
      const parent =
        record.parent?.context ??
        (record.parentId === undefined || record === defaultParent
          ? undefined
          : defaultParent?.context)
      const context = parent
        ? trace.setSpanContext(ROOT_CONTEXT, parent)
        : ROOT_CONTEXT
      const span = trace.getTracer('next.js.tooling').startSpan(
        record.name,
        {
          startTime: time(record.start),
          attributes: {
            // Correlation precedes legacy tags to survive SDK attribute limits.
            'next.tooling.id': record.id,
            ...(record.parentId === undefined
              ? {}
              : { 'next.tooling.parent_id': record.parentId }),
            ...tags,
          },
        },
        context
      )
      if (!canEmit(record)) return
      record.span = span
      record.context = span.spanContext()
    }
    openings.delete(record)
    if (record.end !== undefined) {
      if (!canEmit(record)) return
      if (alreadyStarted && tags) record.span.setAttributes(tags)
      if (!canEmit(record)) return
      if (record.failed) record.span.setStatus({ code: SpanStatusCode.ERROR })
      if (!canEmit(record)) return
      record.span.end(time(record.end))
      release(record)
    }
  } catch {
    warnLoss()
    release(record)
  }
}

function consume() {
  const started = performance.now()
  let processed = 0
  while (state === 'ready' || state === 'finalizing') {
    if (performance.now() >= deadline) {
      warnLoss()
      clearWork()
      return
    }
    if (processed >= TURN_RECORDS || performance.now() - started >= TURN_MS)
      break
    if (!stack.length) {
      const next =
        terminals.values().next().value ?? openings.values().next().value
      if (!next) break
      stack.push(next)
      visiting.add(next)
    }
    const record = stack[stack.length - 1]
    if (!record.retained || record.generation !== generation) {
      stack.pop()
      visiting.delete(record)
      continue
    }
    let parent = record.parent
    if (
      parent &&
      (parent.generation !== generation ||
        (!parent.retained && !parent.context))
    ) {
      parent = record.parent =
        record === defaultParent ? undefined : defaultParent
    }
    if (parent?.retained && !parent.context) {
      if (!visiting.has(parent)) {
        stack.push(parent)
        visiting.add(parent)
        // Traversal itself is bounded too, even before the first SDK call.
        processed++
        continue
      }
      warnLoss()
      record.parent = record === defaultParent ? undefined : defaultParent
      if (
        record.parent &&
        !visiting.has(record.parent) &&
        !record.parent.context
      )
        continue
      record.parent = undefined
    }
    stack.pop()
    visiting.delete(record)
    emit(record)
    processed++
  }
  if (stack.length || terminals.size || openings.size) requestDrain()
  else {
    drained?.()
    drained = undefined
  }
}

export function startReporting(
  id: number,
  parentId: number | undefined,
  name: string,
  start: bigint,
  parent?: ReportingRecord,
  root = false
): ReportingRecord | undefined {
  // A root marker cannot turn a compiler worker into an SDK coordinator.
  if (suppressed) return undefined
  if (root && (defaultParent || state === 'closed')) newRoot()
  if (state === 'closed') return undefined
  const size = 256 + 2 * name.length
  const reserve = defaultParent?.retained || root ? 0 : 1
  if (
    records.size + reserve >= REPLAY_EVENT_LIMIT ||
    retainedBytes + size + reserve * ROOT_BYTES > REPLAY_BYTE_LIMIT ||
    (root && size > ROOT_BYTES)
  ) {
    warnLoss()
    return undefined
  }
  const record: ReportingRecord = {
    id,
    parentId,
    name,
    start,
    parent: root
      ? undefined
      : (parent ??
        records.get(parentId!) ??
        (parentId === undefined ? undefined : defaultParent)),
    retained: true,
    size,
    generation,
  }
  retainedBytes += size
  records.set(id, record)
  openings.add(record)
  if (root) defaultParent = record
  requestDrain()
  return record
}

export function endReporting(
  record: ReportingRecord | undefined,
  end: bigint,
  tags: Record<string, unknown>
) {
  if (
    !record?.retained ||
    record.generation !== generation ||
    record.end !== undefined
  )
    return
  // Terminal metadata must survive payload overflow/encoding failure. There is
  // no separate end queue allocation that can lose an admitted operation's end.
  record.end = end
  record.failed = tags.failed === true
  terminals.add(record)
  try {
    const encoded = JSON.stringify(tags)
    const bytes = 2 * encoded.length
    const reserve = defaultParent?.retained ? 0 : ROOT_BYTES
    if (retainedBytes + bytes + reserve > REPLAY_BYTE_LIMIT) warnLoss()
    else {
      record.encoded = encoded
      record.size += bytes
      retainedBytes += bytes
    }
  } catch {
    warnLoss()
  }
  requestDrain()
}

export function configureReporting(
  parentId: number | undefined,
  worker: boolean
) {
  defaultParent = records.get(parentId!) ?? defaultParent
  suppressed = worker
  if (worker) clearWork()
}

export function replayCompleted(
  events: TraceEvent[],
  timing: (event: TraceEvent) => { start: bigint; end: bigint }
) {
  if (suppressed || state === 'closed') return
  if (!defaultParent) {
    if (events.length) warnLoss()
    return
  }
  const batch = new Map<number, ReportingRecord>()
  for (const event of events) {
    const { start, end } = timing(event)
    const record = startReporting(event.id, event.parentId, event.name, start)
    if (record) {
      endReporting(record, end, event.tags ?? {})
      batch.set(event.id, record)
    }
  }
  // Completion order is not topology order. Resolve the entire admitted batch
  // before any deferred SDK work. A dropped parent falls back to the real root.
  for (const record of batch.values()) {
    record.parent =
      batch.get(record.parentId!) ??
      records.get(record.parentId!) ??
      defaultParent
    if (!record.parent) {
      warnLoss()
      release(record)
    }
  }
}

export function enableReporting(hook?: () => void | Promise<void>) {
  if (state !== 'unregistered' || suppressed) return
  state = 'ready'
  flushHook = hook
  requestDrain()
}

export function flushReporting(): Promise<void> {
  if (finalization) return finalization
  if (state === 'closed') return Promise.resolve()
  const current = generation
  const hook = flushHook
  const registered = state === 'ready'
  state = 'finalizing'
  clearImmediate(scheduled)
  scheduled = undefined
  deadline = performance.now() + FLUSH_TIMEOUT_MS
  finalization = (async () => {
    if (
      registered &&
      !suppressed &&
      (openings.size || terminals.size || stack.length)
    ) {
      await new Promise<void>((resolve) => {
        drained = resolve
        requestDrain()
      })
    }
    if (current !== generation) return
    state = 'closed'
    clearWork()
    defaultParent = undefined
    flushHook = undefined
    if (!registered || !hook) return
    // The app owns this hook; run it only after the consumer is quiescent and
    // closed, with its own allowance independent of the final drain deadline.
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.resolve().then(hook),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('timeout')),
            FLUSH_TIMEOUT_MS
          )
        }),
      ])
    } catch {
      console.warn(
        'Next.js tooling instrumentation.flushTraces() failed or timed out; local traces have already been flushed.'
      )
    } finally {
      clearTimeout(timer)
    }
  })()
  return finalization
}
