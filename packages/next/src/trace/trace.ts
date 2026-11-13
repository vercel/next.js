import { reporter } from './report'
import {
  createRecordingSpan,
  type LocalRecordingSpan,
  recordSpan as recordSpanCallback,
  type LocalSpanOptions,
} from '../server/lib/trace/local-span-recorder'
import type {
  SpanId,
  TraceEvent,
  TraceState,
  ReportingSpanSelection,
} from './types'
import type { Span as OpenTelemetrySpan } from '@opentelemetry/api'
import { normalizeTraceAttributes } from '../server/lib/trace/span-attributes'
export { normalizeTraceAttributes } from '../server/lib/trace/span-attributes'
import { getTimestamp, toHrTime } from '../server/lib/trace/utils'
import { getTraceClock } from '../server/lib/trace/local-span-clock.node'

let replay:
  | typeof import('../server/lib/trace/local-span-replay.node')
  | undefined

if (process.env.NEXT_RUNTIME === 'edge') {
  replay = undefined
} else {
  replay =
    require('../server/lib/trace/local-span-replay.node') as typeof import('../server/lib/trace/local-span-replay.node')
}

const NUM_OF_MICROSEC_IN_NANOSEC = BigInt('1000')
const NUM_OF_SEC_IN_NANOSEC = BigInt('1000000000')
const NUM_OF_MILLISEC_IN_NANOSEC = BigInt('1000000')

let count = 0
const getId = () => {
  count++
  return count
}
let defaultParentSpanId: SpanId | undefined
let shouldSaveTraceEvents: boolean | undefined
let savedTraceEvents: TraceEvent[] = []
let savedReportingSpanSelections: ReportingSpanSelection[] = []

const RECORD_SPAN_THRESHOLD_MS = parseInt(
  process.env.NEXT_TRACE_SPAN_THRESHOLD_MS ?? '-1'
)

interface Attributes {
  [key: string]: unknown
}

type RecordedTraceEvent = TraceEvent & { tags: Attributes }

export enum SpanStatus {
  Started = 'started',
  Stopped = 'stopped',
}

type ReportingOptions = Pick<
  LocalSpanOptions,
  'reportToOtel' | 'reportingRoot'
> & {
  scope?: boolean
  recordToInsights?: boolean
  parent?: LocalSpanOptions['parent'] | Span
}

export class Span {
  readonly recorder: LocalRecordingSpan

  private readonly scope: boolean
  constructor({
    name,
    parentId,
    parent,
    attrs,
    startTime,
    wallStartTimeMs,
    scope = false,
    ...reporting
  }: {
    name: string
    parentId?: SpanId
    attrs?: Attributes
    startTime?: bigint
    wallStartTimeMs?: number
  } & ReportingOptions) {
    this.recorder = createTraceSpan({
      ...reporting,
      scope,
      name,
      parent:
        parent instanceof Span
          ? parent.recorder
          : parent === undefined
            ? parentId
            : parent,
      attributes: attrs,
      monotonicStartTime: startTime,
      wallStartTimeMs,
    })
    this.scope = scope
  }

  get name(): string {
    return getTraceSpanSource(this.recorder)!.event?.name ?? this.recorder.name
  }

  stop(stopTime?: bigint): void {
    this.recorder.end(
      stopTime === undefined ? undefined : toHrTime(replay!.epochTime(stopTime))
    )
  }

  traceChild(
    name: string,
    attrs?: Attributes,
    options?: ReportingOptions
  ): Span {
    return new Span({ ...options, name, parent: this, attrs })
  }

  manualTraceChild(
    name: string,
    startTime?: bigint,
    stopTime?: bigint,
    attrs?: Attributes,
    options?: ReportingOptions
  ): void {
    recordSpan(
      { ...options, name, startTime, endTime: stopTime, attributes: attrs },
      this.recorder
    )
  }

  getId(): SpanId {
    this.recorder.retainReportingContext()
    return getTraceSpanSource(this.recorder)!.id
  }

  setAttribute(key: string, value: unknown): this {
    const attributes =
      getTraceSpanSource(this.recorder)!.event?.tags ?? this.recorder.attributes
    attributes[key] = value
    return this
  }

  traceFn<T>(fn: (span: Span) => T): T {
    return recordSpanCallback(
      { span: this.recorder, scope: this.scope, synchronous: true },
      () => fn(this)
    )
  }

  traceAsyncFn<T>(fn: (span: Span) => T | Promise<T>): Promise<T> {
    return recordSpanCallback({ span: this.recorder, scope: this.scope }, () =>
      fn(this)
    )
  }
}

export const trace = (
  name: string,
  parentId?: SpanId,
  attrs?: Attributes,
  options?: ReportingOptions
) => new Span({ ...options, name, parentId, attrs })

/** Completed span timestamps use nanoseconds since Unix epoch. */
type CompletedSpan = {
  name: string
  startTime?: bigint
  endTime?: bigint
  attributes?: Record<string, unknown>
  reportToOtel?: boolean
  recordToInsights?: boolean
}

export function recordSpan(
  completed: CompletedSpan,
  parent?: OpenTelemetrySpan
): void {
  const clock = getTraceClock()
  const nsPerMs = BigInt(1_000_000)
  const correction = clock.monotonic - BigInt(clock.wallTimeMs) * nsPerMs
  const monotonicEndTime =
    completed.endTime !== undefined
      ? completed.endTime + correction
      : clock.monotonic
  createTraceSpan({
    name: completed.name,
    attributes: completed.attributes,
    parent,
    reportToOtel: completed.reportToOtel,
    recordToInsights: completed.recordToInsights,
    monotonicStartTime:
      completed.startTime !== undefined
        ? completed.startTime + correction
        : clock.monotonic,
    wallStartTimeMs:
      completed.startTime !== undefined
        ? Number(completed.startTime / nsPerMs)
        : clock.wallTimeMs,
    monotonicEndTime,
  })
}

export type LocalSpanTiming = {
  startTime?: import('@opentelemetry/api').SpanOptions['startTime']
  monotonicStartTime?: bigint
  wallStartTimeMs?: number
}

// Numeric file identity and legacy access after completion.
export type TraceSpanSource = {
  id: SpanId
  parentId?: SpanId
  startTime: bigint
  wallStartTimeMs: number
  event?: RecordedTraceEvent
  selectedId?: number
}

const traceSources = new WeakMap<OpenTelemetrySpan, TraceSpanSource>()

export function getTraceSpanSource(
  span: OpenTelemetrySpan
): TraceSpanSource | undefined {
  return traceSources.get(span)
}

export function createTraceSpan(
  options: Omit<LocalSpanOptions, 'parent'> &
    LocalSpanTiming & {
      parent?: OpenTelemetrySpan | SpanId | null
      recordToInsights?: boolean
      scope?: boolean
      monotonicEndTime?: bigint
    }
): LocalRecordingSpan {
  const parent = typeof options.parent === 'object' ? options.parent : undefined
  const ancestor = parent ? getTraceSpanSource(parent) : undefined
  const source = captureTraceSpanSource(
    {
      ...options,
      parent:
        typeof options.parent === 'number'
          ? options.parent
          : options.parent === null
            ? null
            : undefined,
    },
    ancestor
  )
  const offset = BigInt(replay!.getClockOffset())
  source.selectedId = options.reportToOtel ? source.id : ancestor?.selectedId
  if (options.reportToOtel) selectTraceSpanSource(source, ancestor?.selectedId)
  const span = createRecordingSpan(
    {
      ...options,
      parent,
      startTime: source.wallStartTimeMs,
      endTime: undefined,
      reportToOtel: false,
      attributes: options.attributes,
      clock: {
        start: source.startTime + offset,
        end: (time) => getTraceSpanEndTime(time, offset),
      },
      onError: (recording, error) => {
        recording.setAttribute('failed', true)
        if (options.scope) {
          const { recordSpanError } =
            require('../server/lib/trace/tracer') as typeof import('../server/lib/trace/tracer')
          recordSpanError(recording, error as Error)
        } else {
          recording.recordException(error as Error)
          recording.setStatus({ code: 2 })
        }
      },
    },
    (recording, end) => {
      source.event = completeTraceSpan(
        source,
        recording.name,
        recording.attributes,
        end - offset
      )
    }
  )
  traceSources.set(span, source)
  if (process.env.NEXT_RUNTIME === 'edge') {
    // Tooling destinations are only available in Node.
  } else {
    if (options.recordToInsights && process.env.__NEXT_DEV_SERVER) {
      const { captureInsightSpanRecorder } =
        require('../server/lib/trace/request-insights-span-recorder') as typeof import('../server/lib/trace/request-insights-span-recorder')
      const type = options.attributes?.['next.span_type']
      span.addDelivery(
        captureInsightSpanRecorder(
          span,
          parent ?? undefined,
          options.name,
          typeof type === 'string' ? type : options.name
        )
      )
    }
    if (options.reportToOtel) {
      span.startReporting(
        {
          id: source.id,
          parentId: source.parentId,
          attributes: {
            ...normalizeTraceAttributes(span.attributes),
            'next.tooling.id': source.id,
            ...(source.parentId === undefined
              ? {}
              : { 'next.tooling.parent_id': source.parentId }),
          },
        },
        options.reportingRoot,
        options.monotonicEndTime !== undefined || options.endTime !== undefined
      )
    }
  }
  const endTime =
    options.monotonicEndTime === undefined
      ? options.endTime
      : toHrTime(options.monotonicEndTime + offset)
  if (endTime !== undefined) span.end(endTime)
  return span
}

export function captureTraceSpanSource(
  options: LocalSpanTiming & {
    parent?: SpanId | null
  },
  parent?: TraceSpanSource
): TraceSpanSource {
  const time = options.startTime
  const epochMs = time === undefined ? undefined : getTimestamp(time)
  let monotonicStartTime = options.monotonicStartTime
  let wallStartTimeMs = options.wallStartTimeMs ?? epochMs
  if (monotonicStartTime === undefined || wallStartTimeMs === undefined) {
    const clock = getTraceClock()
    monotonicStartTime ??=
      epochMs === undefined
        ? clock.monotonic
        : epochMillisecondsToNanoseconds(epochMs) -
          BigInt(replay!.getClockOffset())
    wallStartTimeMs ??= clock.wallTimeMs
  }
  return {
    id: getId(),
    parentId:
      options.parent === null
        ? undefined
        : (options.parent ?? parent?.id ?? defaultParentSpanId),
    startTime: monotonicStartTime,
    wallStartTimeMs,
  }
}

/** Records the selected worker hierarchy independently of SDK availability. */
export function selectTraceSpanSource(
  source: TraceSpanSource,
  parentSelectedId?: SpanId
): void {
  if (shouldSaveTraceEvents) {
    savedReportingSpanSelections.push({
      id: source.id,
      parentId: parentSelectedId ?? source.parentId,
    })
  }
}

// Multiply integer milliseconds as bigint so epoch magnitudes cannot lose the
// low nanoseconds before the clock correction is applied.
function epochMillisecondsToNanoseconds(time: number): bigint {
  const whole = Math.trunc(time)
  return (
    BigInt(whole) * NUM_OF_MILLISEC_IN_NANOSEC +
    BigInt(Math.trunc((time - whole) * 1_000_000))
  )
}

function getTraceSpanEndTime(
  endTime: Parameters<OpenTelemetrySpan['end']>[0],
  offset: bigint
): bigint {
  if (Array.isArray(endTime)) {
    return BigInt(endTime[0]) * NUM_OF_SEC_IN_NANOSEC + BigInt(endTime[1])
  } else if (endTime === undefined) {
    return process.hrtime.bigint() + offset
  } else {
    return epochMillisecondsToNanoseconds(getTimestamp(endTime))
  }
}

export function completeTraceSpan(
  source: TraceSpanSource,
  name: string,
  attributes: Attributes,
  end: bigint
): RecordedTraceEvent {
  const duration = (end - source.startTime) / NUM_OF_MICROSEC_IN_NANOSEC
  if (duration > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Duration is too long to express as float64: ${duration}`)
  }
  const event: RecordedTraceEvent = {
    name,
    id: source.id,
    parentId: source.parentId,
    timestamp: Number(source.startTime / NUM_OF_MICROSEC_IN_NANOSEC),
    duration: Number(duration),
    startTime: source.wallStartTimeMs,
    tags: attributes,
  }
  if (duration > RECORD_SPAN_THRESHOLD_MS * 1000) {
    reporter.report(event)
    if (shouldSaveTraceEvents) savedTraceEvents.push(event)
  }
  return event
}

export const flushAllTraces = () => reporter.flushAll()

/**
 * Flush and release the trace file handle. Intended for tests that need to
 * delete the directory holding the trace afterwards.
 */
export const closeAllTraces = () => reporter.close()

// This code supports workers by serializing the state of tracers when the
// worker is initialized, and serializing the trace events from the worker back
// to the main process to record when the worker is complete.
export const exportTraceState = (): TraceState => ({
  defaultParentSpanId,
  lastId: count,
  shouldSaveTraceEvents,
  ...(shouldSaveTraceEvents
    ? { reportingSpanSelections: savedReportingSpanSelections.slice() }
    : {}),
  ...(replay
    ? {
        otelClockOffset: replay.getClockOffset(),
      }
    : {}),
})
export const initializeTraceState = (state: TraceState) => {
  count = state.lastId
  defaultParentSpanId = state.defaultParentSpanId
  shouldSaveTraceEvents = state.shouldSaveTraceEvents
  savedReportingSpanSelections = []

  if (replay) {
    replay.configureState(
      defaultParentSpanId,
      !!shouldSaveTraceEvents,
      state.otelClockOffset
    )
  }
}

export function getTraceEvents(): TraceEvent[] {
  return savedTraceEvents
}

export function recordTraceEvents(
  events: TraceEvent[],
  selections?: readonly ReportingSpanSelection[]
) {
  for (const traceEvent of events) {
    reporter.report(traceEvent)
    if (traceEvent.id > count) {
      count = traceEvent.id + 1
    }
  }
  if (shouldSaveTraceEvents) {
    savedTraceEvents.push(...events)
  }
  if (selections?.length) {
    replay?.replayWorkerEvents(events, selections)
  }
}

export const clearTraceEvents = () => {
  savedReportingSpanSelections = []
  return (savedTraceEvents = [])
}

/**
 * Converts hrtime (process.hrtime.bigint()) to epoch-based nanoseconds.
 *
 * hrtime values are relative to an arbitrary point in the past, while
 * epoch-based times are nanoseconds since Unix epoch (Jan 1, 1970).
 *
 * This is useful when passing hrtime values to APIs that expect epoch-based times,
 * such as Span.manualTraceChild().
 */
export function hrtimeToEpochNanoseconds(hrtimeValue: bigint): bigint {
  const clock = getTraceClock()
  const offset =
    BigInt(clock.wallTimeMs) * NUM_OF_MILLISEC_IN_NANOSEC - clock.monotonic
  return hrtimeValue + offset
}
