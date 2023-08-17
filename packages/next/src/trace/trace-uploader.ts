import findUp from 'next/dist/compiled/find-up'
import fsPromise from 'fs/promises'
import child_process from 'child_process'
import assert from 'assert'
// @ts-ignore
import fetch from 'next/dist/compiled/node-fetch'
import os from 'os'
import { createInterface } from 'readline'
import { createReadStream } from 'fs'
import path from 'path'
import { Resource } from '@opentelemetry/resources'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import {
  context,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  INVALID_SPAN_CONTEXT,
  Span,
  Tracer,
  trace as ttt,
} from '@opentelemetry/api'
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)

const EVENT_FILTER = new Set([
  'client-hmr-latency',
  'hot-reloader',
  'webpack-invalidated-client',
  'webpack-invalidated-server',
])

// Dummy span implementation that does not record anything.
// Copy-paste from https://github.com/open-telemetry/opentelemetry-js/blob/b400c2e5d9729c3528482781a93393602dc6dc9f/api/src/trace/NonRecordingSpan.ts#L30
// since this is not a public interface.
// This is useful to construct whole hierarchy of the spans, but would like to skip recording of some of them.
class NonRecordingSpan implements Span {
  constructor(private readonly _spanContext: any = INVALID_SPAN_CONTEXT) {}

  // Returns a SpanContext.
  spanContext(): any {
    return this._spanContext
  }

  // By default does nothing
  setAttribute(_key: string, _value: unknown): this {
    return this
  }

  // By default does nothing
  setAttributes(_attributes: any): this {
    return this
  }

  // By default does nothing
  addEvent(_name: string, _attributes?: any): this {
    return this
  }

  // By default does nothing
  setStatus(_status: any): this {
    return this
  }

  // By default does nothing
  updateName(_name: string): this {
    return this
  }

  // By default does nothing
  end(_endTime?: any): void {}

  // isRecording always returns false for NonRecordingSpan.
  isRecording(): boolean {
    return false
  }

  // By default does nothing
  recordException(_exception: any, _time?: any): void {}
}

const { NEXT_TRACE_UPLOAD_DEBUG } = process.env

const [, , traceUploadUrl, mode, _isTurboSession, projectDir, distDir] =
  process.argv
const isTurboSession = _isTurboSession === 'true'

interface TraceEvent {
  traceId: string
  parentId?: number
  name: string
  id: number
  startTime: number
  timestamp: number
  duration: number
  tags: Record<string, unknown>
}

interface TraceMetadata {
  arch: string
  commit: string
  cpus: number
  mode: string
  pkgName: string
  platform: string
  isTurboSession: boolean
}

;(async function upload() {
  const projectPkgJsonPath = await findUp('package.json')
  assert(projectPkgJsonPath)

  const projectPkgJson = JSON.parse(
    await fsPromise.readFile(projectPkgJsonPath, 'utf-8')
  )
  const pkgName = projectPkgJson.name

  const commit = child_process
    .spawnSync(
      os.platform() === 'win32' ? 'git.cmd' : 'git',
      ['rev-parse', 'HEAD'],
      { shell: true }
    )
    .stdout.toString()
    .trimEnd()

  const readLineInterface = createInterface({
    input: createReadStream(path.join(projectDir, distDir, 'trace')),
    crlfDelay: Infinity,
  })

  const traceExporter = new OTLPTraceExporter({
    url: 'https://api.honeycomb.io/v1/traces',
    headers: {
      'x-honeycomb-team': process.env.HONEYCOMB_TEAM,
      'x-honeycomb-dataset': 'program-next-dx-perf-poc',
    },
  })

  const provider = new BasicTracerProvider({
    resource: new Resource({
      'service.name': 'program-next-dx-perf-poc',
    }),
  })
  provider.addSpanProcessor(new SimpleSpanProcessor(traceExporter))

  const reportSpanRecursively = (
    tracer: Tracer,
    trace: any,
    parentSpan?: any,
    rootCtx?: any
  ) => {
    // Create a context to pass to the current span if there is a parent span
    const ctx = parentSpan
      ? ttt.setSpan(context.active(), parentSpan)
      : undefined

    let span: Span

    // If trace's name corresponds to an event that we want to record, create a actual span for it.
    // Otherwise, create a NonRecordingSpan, which is a dummy span won't be reported.
    // [NOTE]: the correct way is let processer filters
    // https://docs.honeycomb.io/manage-data-volume/otel-collector/#filtering-span-events-and-other-data
    if (EVENT_FILTER.has(trace.name)) {
      span = tracer.startSpan(
        trace.name,
        {
          startTime: trace.startTime,
          root: !parentSpan,
        },
        ctx
      )
    } else {
      span = new NonRecordingSpan()
    }

    span.setAttributes(trace?.tags ?? {})

    // Spans should be reported in chronological order
    trace.children?.sort((a: any, b: any) => a.startTime - b.startTime)
    trace.children?.forEach((childTrace: any) =>
      reportSpanRecursively(tracer, childTrace, span)
    )

    const endTime = trace.startTime + trace.duration / 1000

    // record end time of nested child span, latest will be the end time of the pseudo root span
    if (rootCtx) {
      if (!rootCtx.rootEndTime || endTime > rootCtx.rootEndTime) {
        rootCtx.rootEndTime = endTime
      }
    }

    span.end(endTime)
  }

  const traces: Map<String, any> = new Map()
  const rootTraces = []

  // Input trace file contains newline-separated sets of traces, where each line is valid JSON
  // type of Array<TraceEvent>. Read it line-by-line to manually reconstruct trace trees.
  //
  // We have to read through end of the trace -
  // Trace events in the input file can appear out of order, so we need to remodel the shape of the span tree before reporting
  for await (const line of readLineInterface) {
    JSON.parse(line).forEach((trace: any) => {
      traces.set(trace.id, trace)
    })
  }

  // Link inner, child spans to the parents to reconstruct span with correct relations
  for (const event of traces.values()) {
    if (!!event.parentId) {
      event.parent = traces.get(event.parentId)
      if (event.parent) {
        if (!event.parent.children) event.parent.children = []
        event.parent.children.push(event)
      }
    } else {
      rootTraces.push(event)
    }
  }

  const tracer = provider.getTracer('program-next-dx-perf-poc')

  // There can be an independent spans outside of root span of hot-reloader, create a pseudo root to contain all of them
  // as child for a single trace
  const pseudoRootSpan = tracer.startSpan('dev-build-root', {
    root: true,
    // Mark the earlest start time among root spans as root's start time
    startTime: rootTraces.reduce((acc, value) => {
      if (!acc || value.startTime < acc) {
        return value.startTime
      }
      return acc
    }, undefined),
  })

  console.log('0000000000', {
    commit,
    mode,
    pkgName,
    isTurboSession,
    arch: os.arch(),
    cpus: os.cpus().length,
    platform: os.platform(),
  })
  pseudoRootSpan.setAttributes({
    commit,
    mode,
    pkgName,
    isTurboSession,
    arch: os.arch(),
    cpus: os.cpus().length,
    platform: os.platform(),
  })

  // A context to be passed into reportSpanRecursively, currently being used to figure out
  // the end time of the last span, which indicates pseudo root span's end time for the whole session length.
  const ctx = {
    rootEndTime: undefined,
  }

  for (const trace of rootTraces) {
    reportSpanRecursively(tracer, trace, pseudoRootSpan, ctx)
  }

  pseudoRootSpan.end()
})()
