import type {
  Attributes,
  Context,
  Span,
  SpanContext,
  SpanOptions,
  SpanStatus,
} from '@opentelemetry/api'
import type { TraceEvent, ReportingSpanSelection } from '../../../trace/types'
import { getTraceClock } from './local-span-clock.node'
import type { SpanStoreEvent } from './span-store'
import { toHrTime } from './utils'

type LocalSpanDelegate = {
  span?: Span
  context?: SpanContext
  eventsForwarded?: number
}
type LocalSpanCompletion = {
  name?: string
  attributes?: Parameters<Span['setAttributes']>[0]
  events?: SpanStoreEvent[]
  status?: SpanStatus
}

const clock = getTraceClock()
let epochOffset = BigInt(clock.wallTimeMs) * BigInt(1_000_000) - clock.monotonic
export const epochTime = (time: bigint) => time + epochOffset
export const getClockOffset = () => epochOffset.toString()
export const REPLAY_EVENT_LIMIT = 1_000
const INVALID_DATA = Symbol()
let delivering = false
const pendingReporting = new Map<ReportingToken, ReplaySnapshot>()

export type ReportingToken = LocalSpanDelegate & {
  id: number
  parentId?: number
  generation: number
  parent?: ReportingToken
  done?: boolean
}
export type ReportingStart = {
  name: string
  parentId?: number
  start: bigint
  attributes?: SpanOptions['attributes']
  links?: SpanOptions['links']
}
export type ReportingCompletion = LocalSpanCompletion & { end: bigint }
export type ReplaySnapshot = {
  token: ReportingToken
  start: ReportingStart
  completion?: ReportingCompletion
  pending: boolean
}
let state: 'unregistered' | 'ready' | 'closed' = 'unregistered'
let generation = 0
let suppressed = false
let warned = false
let count = 0
let root: ReportingToken | undefined
// Only live coordinator context tokens enter this lookup; worker IDs are local
// to their batch, and completed spans leave immediately.
const coordinator = new Map<number, ReportingToken>()

export function warnLoss() {
  if (warned) return
  warned = true
  console.warn(
    'Next.js OpenTelemetry reporting limit reached or reporting failed; some external signals or attributes may be missing. Local trace files are unaffected.'
  )
}
export const isCurrent = (token: ReportingToken) =>
  !suppressed &&
  state !== 'closed' &&
  token.generation === generation &&
  !token.done
export const isReady = (token: ReportingToken) =>
  state === 'ready' && isCurrent(token)
export function releaseSnapshot(item: ReplaySnapshot) {
  if (!item.pending) return
  if (item.token.generation === generation && item.token !== root) count--
  item.pending = false
}
export function finish(token: ReportingToken, failed = false) {
  if (failed && token.generation === generation) warnLoss()
  token.done = true
  token.span = undefined
  token.parent = undefined
  if (coordinator.get(token.id) === token) coordinator.delete(token.id)
}
function clear() {
  for (const token of coordinator.values()) finish(token)
  clearReporting()
  count = 0
}
export function prepare(
  delegate: LocalSpanDelegate,
  id: number,
  parentId?: number,
  parent?: ReportingToken,
  reportingRoot = false,
  local = true
): ReportingToken | undefined {
  if (suppressed) return
  if (reportingRoot && (root || state === 'closed')) {
    clear()
    generation++
    state = 'unregistered'
    warned = false
    root = undefined
  }
  if (state === 'closed') return
  const token = Object.assign(delegate, {
    id,
    parentId,
    generation,
    parent: reportingRoot
      ? undefined
      : (parent ??
        (parentId === undefined
          ? undefined
          : (coordinator.get(parentId) ?? root))),
  })
  if (reportingRoot) root = token
  if (local && coordinator.size < REPLAY_EVENT_LIMIT) coordinator.set(id, token)
  return token
}
// Inputs have the OTel data schema; methods and producer prototypes stay local.
function detach<T>(input: T): T | undefined {
  const capturedGeneration = generation
  const copy = (value: unknown, depth = 0): unknown => {
    if (typeof value === 'function' || typeof value === 'symbol')
      return undefined
    if (value === null || typeof value !== 'object') return value
    if (depth > 8) throw INVALID_DATA
    if (Array.isArray(value)) {
      const length = value.length
      if (!Number.isSafeInteger(length) || length < 0) throw INVALID_DATA
      const result: unknown[] = []
      for (let i = 0; i < length; i++) result[i] = copy(value[i], depth + 1)
      return result
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== null && prototype !== Object.prototype) return undefined
    const result: Record<string, unknown> = Object.create(null)
    for (const key of Object.keys(value)) {
      const child = (value as Record<string, unknown>)[key]
      if (child === undefined || typeof child === 'function') continue
      result[key] = copy(child, depth + 1)
    }
    return result
  }
  try {
    return copy(input) as T
  } catch {
    if (generation === capturedGeneration) warnLoss()
  }
}
export function snapshot(
  token: ReportingToken,
  start: ReportingStart,
  completion?: ReportingCompletion,
  previous?: ReplaySnapshot
): ReplaySnapshot | undefined {
  if (!isCurrent(token)) return
  const payload = completion ? detach(completion) : undefined
  const terminal = completion && {
    end: completion.end,
    status:
      completion.status?.code === 2 || completion.attributes?.failed === true
        ? { code: 2 as const }
        : undefined,
  }
  if (payload) payload.status ??= terminal?.status
  if (!isCurrent(token)) return
  let item = previous?.pending ? previous : undefined
  if (!item) {
    const metadata = detach({
      ...start,
      links: token.span ? undefined : start.links,
    })
    if (!metadata) {
      finish(token)
      return
    }
    if (!isCurrent(token)) return
    if (token !== root && count >= REPLAY_EVENT_LIMIT - 1) {
      warnLoss()
      finish(token)
      return
    }
    item = { token, start: metadata, pending: true }
    if (token !== root) count++
  }
  if (completion) item.completion = payload ?? terminal
  return item
}
export function parentContext(token: ReportingToken) {
  return (
    (token.parent?.generation === generation
      ? token.parent.context
      : undefined) ??
    (token === root || (token.parentId === undefined && !token.parent)
      ? undefined
      : root?.context)
  )
}
export function configureState(
  parentId: number | undefined,
  worker: boolean,
  offset?: string
) {
  if (offset) epochOffset = BigInt(offset)
  root ??= coordinator.get(parentId!)
  suppressed = worker
  if (worker) clear()
}
export const getRoot = () => root
export function enableReporting() {
  if (state !== 'unregistered' || suppressed) return
  state = 'ready'
  deliverReportingSpan()
}
export function closeReporting() {
  clear()
  state = 'closed'
  generation++
  root = undefined
}
export function replayWorkerEvents(
  events: TraceEvent[],
  selections: readonly ReportingSpanSelection[] = []
) {
  if (suppressed || state === 'closed') return
  if (!root) {
    if (events.length) warnLoss()
    return
  }
  const parents = new Map(selections.map(({ id, parentId }) => [id, parentId]))
  const batch = new Map(
    events
      .filter((event) => parents.has(event.id))
      .map((event) => [
        event.id,
        { event, token: prepare({}, event.id, undefined, root, false, false)! },
      ])
  )
  const visited = new Set<number>()
  const visiting = new Set<number>()
  for (const id of batch.keys()) {
    const stack = [id]
    while (stack.length) {
      const next = stack[stack.length - 1]
      if (visited.has(next)) {
        stack.pop()
        continue
      }
      const entry = batch.get(next)!
      const parentId = parents.get(next) ?? entry.event.parentId
      const parent = batch.get(parentId!)
      if (parent && !visited.has(parentId!)) {
        if (!visiting.has(next)) {
          visiting.add(next)
          if (!visiting.has(parentId!)) {
            stack.push(parentId!)
            continue
          }
          warnLoss()
        }
      }
      entry.token.parent =
        parent && visited.has(parentId!)
          ? parent.token
          : (coordinator.get(parentId!) ?? root)
      if (parent && !visited.has(parentId!)) entry.token.parent = root
      visited.add(next)
      visiting.delete(next)
      stack.pop()
      const { event } = entry
      deliverReportingSpan(
        entry.token,
        {
          name: event.name,
          parentId: event.parentId,
          attributes: {
            'next.tooling.id': event.id,
            ...(event.parentId === undefined
              ? {}
              : { 'next.tooling.parent_id': event.parentId }),
          },
          start: epochTime(BigInt(event.timestamp) * BigInt(1_000)),
        },
        {
          end: epochTime(
            (BigInt(event.timestamp) + BigInt(event.duration)) * BigInt(1_000)
          ),
          attributes: event.tags as ReportingCompletion['attributes'],
        }
      )
    }
  }
}

function startDelegate(
  delegate: LocalSpanDelegate,
  name: string,
  options: SpanOptions,
  context: Context,
  canUse: () => boolean
): void {
  if (delegate.span || !canUse()) return
  const { getTracerInstance } =
    require('./otel-api') as typeof import('./otel-api')
  const tracer = getTracerInstance()
  if (!canUse()) return
  const span = tracer.startSpan(name, options, context)
  if (!canUse()) return
  delegate.span = span
  const spanContext = span.spanContext()
  if (!canUse()) return
  delegate.context = spanContext
}

function endDelegate(
  delegate: LocalSpanDelegate,
  endTime: Parameters<Span['end']>[0],
  completion: LocalSpanCompletion,
  canUse: () => boolean
): void {
  const span = delegate.span
  if (!span || !canUse()) return
  if (completion?.name) {
    span.updateName(completion.name)
    if (!canUse()) return
  }
  if (completion?.attributes) {
    span.setAttributes(completion.attributes)
    if (!canUse()) return
  }
  deliverEvents(delegate, completion?.events ?? [], canUse)
  if (!canUse()) return
  if (completion?.status) {
    span.setStatus(completion.status)
    if (!canUse()) return
  }
  try {
    span.end(endTime)
  } finally {
    if (delegate.span === span) delegate.span = undefined
  }
}

export function deliverEvents(
  delegate: LocalSpanDelegate,
  events: SpanStoreEvent[],
  canUse: () => boolean
): void {
  for (let i = delegate.eventsForwarded ?? 0; i < events.length; i++) {
    if (!delegate.span || !canUse()) return
    const event = events[i]
    delegate.span.addEvent(event.name, event.attributes, event.timestamp)
    if (!canUse()) return
    delegate.eventsForwarded = i + 1
  }
}

function clearReporting(): void {
  for (const item of pendingReporting.values()) releaseSnapshot(item)
  pendingReporting.clear()
}

export function deliverReportingSpan(
  token?: ReportingToken,
  start?: ReportingStart,
  completion?: ReportingCompletion
): void {
  if (token && start) {
    if (!isCurrent(token)) return
    if (!isReady(token) || delivering) {
      const item = snapshot(
        token,
        start,
        completion,
        pendingReporting.get(token)
      )
      if (item) pendingReporting.set(token, item)
      if (isReady(token) && !delivering) deliverReportingSpan()
      return
    }
  }
  if (delivering) return
  delivering = true
  try {
    if (token && start) emitReportingSpan(token, start, completion)
    while (pendingReporting.size) {
      const item =
        pendingReporting.get(getRoot()!) ??
        pendingReporting.values().next().value!
      if (isCurrent(item.token) && !isReady(item.token)) break
      pendingReporting.delete(item.token)
      releaseSnapshot(item)
      emitReportingSpan(item.token, item.start, item.completion)
    }
  } finally {
    delivering = false
  }
}

function emitReportingSpan(
  token: ReportingToken,
  start: ReportingStart,
  completion?: ReportingCompletion
): void {
  const canUse = () => isReady(token)
  if (!canUse()) return
  try {
    const { api } = require('./otel-api') as typeof import('./otel-api')
    const parent = parentContext(token)
    const context = parent
      ? api.trace.setSpanContext(api.ROOT_CONTEXT, parent)
      : api.ROOT_CONTEXT
    const metricsOnly =
      start.name === 'memory-usage' ||
      start.name === 'server-restart-close-to-memory-threshold'
    const completedAtStart = !!completion && !token.span
    const attributes = Object.fromEntries(
      Object.entries(completion?.attributes ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? JSON.stringify(value) : value,
      ])
    )
    if (!canUse()) return
    if (!metricsOnly && !token.span) {
      startDelegate(
        token,
        completion?.name ?? start.name,
        {
          startTime: toHrTime(start.start),
          links: start.links,
          attributes: {
            ...start.attributes,
            ...(completion ? attributes : undefined),
          },
        },
        context,
        canUse
      )
    }
    if (!completion || !canUse()) return
    const metricParent = token.context ?? parent ?? getRoot()?.context
    reportMeasurements(
      start.name,
      attributes,
      metricParent
        ? api.trace.setSpanContext(api.ROOT_CONTEXT, metricParent)
        : context,
      canUse
    )
    if (!canUse()) return
    endDelegate(
      token,
      toHrTime(completion.end),
      {
        ...completion,
        name: completedAtStart ? undefined : completion.name,
        attributes: completedAtStart ? undefined : attributes,
        status:
          completion.status ??
          (attributes.failed === true ? { code: 2 } : undefined),
      },
      canUse
    )
    if (canUse()) finish(token)
  } catch {
    finish(token, true)
  }
}

function reportMeasurements(
  name: string,
  attributes: Attributes,
  context: Context,
  canUse: () => boolean
): void {
  const restart = name === 'server-restart-close-to-memory-threshold'
  const native =
    name === 'turbopack-persistence' || name === 'turbopack-compaction'
  if (!native && name !== 'memory-usage' && !restart) return
  const { api } = require('./otel-api') as typeof import('./otel-api')
  const meter = api.metrics.getMeter('next.js', process.env.__NEXT_VERSION)
  const measurements = native
    ? [
        ['bytes_written', 'turbopack.bytes_written', 'By'],
        ['bytes_deleted', 'turbopack.bytes_deleted', 'By'],
        ['task_count', 'turbopack.task_count', '{task}'],
      ]
    : [
        ['memory.rss', 'memory.rss', 'By'],
        ['memory.heapUsed', 'memory.heap_used', 'By'],
        ['memory.heapTotal', 'memory.heap_total', 'By'],
        ['memory.heapMax', 'memory.heap_limit', 'By'],
        ['memory.heapSizeLimit', 'memory.heap_limit', 'By'],
      ]
  for (const [key, suffix, unit] of measurements) {
    if (attributes[key] === undefined) continue
    const value = Number(attributes[key])
    if (!Number.isFinite(value) || value < 0 || !canUse()) continue
    const histogram = meter.createHistogram(`next.tooling.${suffix}`, {
      unit,
    })
    if (!canUse()) return
    histogram.record(value, { operation: name }, context)
  }
  if (restart && canUse())
    meter
      .createCounter('next.tooling.server.restarts', { unit: '{restart}' })
      .add(1, { reason: 'memory-threshold' }, context)
}
