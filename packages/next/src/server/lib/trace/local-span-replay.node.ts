import type {
  Attributes,
  Link,
  Span,
  SpanContext,
  SpanStatus,
} from '@opentelemetry/api'
import type { TraceEvent, ReportingSpanSelection } from '../../../trace/types'
import { getTraceClock } from './local-span-clock.node'
import { reportToolingMeasurements } from './local-span-metrics.node'
import type { SpanStoreEvent } from './span-store'
import { toHrTime } from './utils'

const clock = getTraceClock()
let epochOffset = BigInt(clock.wallTimeMs) * BigInt(1_000_000) - clock.monotonic

export const epochTime = (time: bigint) => time + epochOffset
export const getClockOffset = () => epochOffset.toString()
export const REPLAY_EVENT_LIMIT = 1_000

export type ReportingStart = {
  id: number
  parentId?: number
  name: string
  start: bigint
  attributes?: Attributes
  links?: Link[]
}

export type ReportingCompletion = {
  end: bigint
  name?: string
  attributes?: Attributes
  events?: SpanStoreEvent[]
  status?: SpanStatus
}

type ReplaySession = {
  ready: boolean
  closed: boolean
  flushing: boolean
  warned: boolean
  nonRootCount: number
  root?: ReportingSpan
  records: Map<number, ReportingSpan>
  queue: Array<() => void>
}

export type ReportingSpan = ReportingStart & {
  session: ReplaySession
  completion?: ReportingCompletion
  span?: Span
  context?: SpanContext
  done?: boolean
  failed?: boolean
}

let session = createSession()
let suppressed = false

function createSession(): ReplaySession {
  return {
    ready: false,
    closed: false,
    flushing: false,
    warned: false,
    nonRootCount: 0,
    records: new Map(),
    queue: [],
  }
}

function warnLoss(target = session) {
  if (target.warned) return
  target.warned = true
  console.warn(
    'Next.js OpenTelemetry reporting limit reached or reporting failed; some external signals or attributes may be missing. Local trace files are unaffected.'
  )
}

export function startSpan(
  start: ReportingStart,
  root = false
): ReportingSpan | undefined {
  if (suppressed) return
  if (root && (session.root || session.closed)) {
    session.closed = true
    session = createSession()
  }
  if (session.closed) return
  if (
    !root &&
    !session.ready &&
    session.nonRootCount >= REPLAY_EVENT_LIMIT - 1
  ) {
    warnLoss()
    return
  }

  // shortcut: queued attribute values stay caller-owned; copy if mutation corrupts telemetry.
  const record: ReportingSpan = {
    ...start,
    session,
  }
  if (root) session.root = record
  else session.nonRootCount++
  session.records.set(record.id, record)
  session.queue.push(() => startOpenTelemetrySpan(record))
  return record
}

export function completeSpan(
  record: ReportingSpan,
  completion: ReportingCompletion
): void {
  if (record.done || record.session.closed) return
  record.done = true
  record.completion = completion
  record.session.queue.push(() => completeOpenTelemetrySpan(record, completion))
  flush(record.session)
}

export function flushReporting(): void {
  flush(session)
}

function flush(target: ReplaySession): void {
  if (!target.ready || target.closed || target.flushing) return
  target.flushing = true
  try {
    while (target.queue.length && !target.closed) {
      target.queue.shift()!()
    }
  } finally {
    target.flushing = false
  }
}

function getParentContext(record: ReportingSpan): SpanContext | undefined {
  return (
    record.session.records.get(record.parentId!)?.context ??
    (record === record.session.root || record.parentId === undefined
      ? undefined
      : record.session.root?.context)
  )
}

function startOpenTelemetrySpan(record: ReportingSpan): void {
  if (record.failed || record.span) return
  const metricsOnly =
    record.name === 'memory-usage' ||
    record.name === 'server-restart-close-to-memory-threshold'
  if (metricsOnly) return
  try {
    const { api, getTracerInstance } =
      require('./otel-api') as typeof import('./otel-api')
    const parent = getParentContext(record)
    const context = parent
      ? api.trace.setSpanContext(api.ROOT_CONTEXT, parent)
      : api.ROOT_CONTEXT
    const completion = record.completion
    record.span = getTracerInstance().startSpan(
      completion?.name ?? record.name,
      {
        startTime: toHrTime(record.start),
        links: record.links,
        attributes: {
          ...record.attributes,
          ...(completion
            ? completionAttributes(completion.attributes)
            : undefined),
        },
      },
      context
    )
    record.context = record.span.spanContext()
  } catch {
    record.failed = true
    warnLoss(record.session)
  }
}

function completionAttributes(attributes?: Attributes): Attributes {
  return Object.fromEntries(
    Object.entries(attributes ?? {}).map(([key, value]) => [
      key,
      Array.isArray(value) ? JSON.stringify(value) : value,
    ])
  )
}

function completeOpenTelemetrySpan(
  record: ReportingSpan,
  completion: ReportingCompletion
): void {
  if (record.failed) return
  const attributes = completionAttributes(completion.attributes)
  try {
    const { api } = require('./otel-api') as typeof import('./otel-api')
    const parent = getParentContext(record)
    const metricParent =
      record.context ?? parent ?? record.session.root?.context
    reportToolingMeasurements(
      record.name,
      attributes,
      metricParent
        ? api.trace.setSpanContext(api.ROOT_CONTEXT, metricParent)
        : api.ROOT_CONTEXT
    )

    const span = record.span
    if (!span) return
    if (completion.name) span.updateName(completion.name)
    span.setAttributes(attributes)
    for (const event of completion.events ?? []) {
      span.addEvent(event.name, event.attributes, event.timestamp)
    }
    if (completion.status) span.setStatus(completion.status)
    else if (attributes.failed === true) span.setStatus({ code: 2 })
    span.end(toHrTime(completion.end))
    record.span = undefined
    if (
      record !== record.session.root &&
      record.session.records.get(record.id) === record
    ) {
      record.session.records.delete(record.id)
    }
  } catch {
    record.failed = true
    record.span = undefined
    warnLoss(record.session)
  }
}

export function configureState(
  _parentId: number | undefined,
  worker: boolean,
  offset?: string
): void {
  if (offset) epochOffset = BigInt(offset)
  suppressed = worker
  if (worker) {
    session.closed = true
    session.queue.length = 0
    session.records.clear()
  }
}

export function enableReporting(): void {
  if (session.closed || suppressed) return
  session.ready = true
  flush(session)
  session.nonRootCount = 0
}

export function closeReporting(): void {
  session.closed = true
  session.queue.length = 0
  session.records.clear()
}

export function replayWorkerEvents(
  events: TraceEvent[],
  selections: readonly ReportingSpanSelection[] = []
): void {
  if (session.closed || suppressed || selections.length === 0) return
  const target = session
  const selected = new Set(selections.map(({ id }) => id))
  const remaining = target.ready
    ? events.length
    : Math.max(0, REPLAY_EVENT_LIMIT - 1 - target.nonRootCount)
  const batch = events
    .filter((event) => selected.has(event.id))
    .slice(0, remaining)
  target.nonRootCount += batch.length
  if (batch.length < selections.length) warnLoss(target)
  target.queue.push(() => replayWorkerBatch(target, batch, selections))
  flush(target)
}

function replayWorkerBatch(
  target: ReplaySession,
  events: TraceEvent[],
  selections: readonly ReportingSpanSelection[]
): void {
  const parents = new Map(selections.map(({ id, parentId }) => [id, parentId]))
  const batch = new Map(events.map((event) => [event.id, event]))

  const records = new Map<number, ReportingSpan>()
  const visiting = new Set<number>()
  const emit = (id: number): ReportingSpan | undefined => {
    const existing = records.get(id)
    if (existing) return existing
    const event = batch.get(id)
    if (!event) return target.records.get(id)
    const parentId = parents.get(id) ?? event.parentId
    if (visiting.has(id)) return target.root
    visiting.add(id)
    const parent = parentId === undefined ? undefined : emit(parentId)
    visiting.delete(id)
    const completion: ReportingCompletion = {
      end: epochTime(
        (BigInt(event.timestamp) + BigInt(event.duration)) * BigInt(1_000)
      ),
      attributes: event.tags as Attributes,
    }
    const record: ReportingSpan = {
      id,
      parentId,
      name: event.name,
      start: epochTime(BigInt(event.timestamp) * BigInt(1_000)),
      attributes: {
        'next.tooling.id': id,
        ...(event.parentId === undefined
          ? {}
          : { 'next.tooling.parent_id': event.parentId }),
      },
      session: target,
      completion,
    }
    records.set(id, record)
    if (parent?.context) target.records.set(parentId!, parent)
    startOpenTelemetrySpan(record)
    completeOpenTelemetrySpan(record, completion)
    return record
  }

  for (const id of batch.keys()) emit(id)
}
