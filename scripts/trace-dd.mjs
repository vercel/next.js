import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'
import Tracer from 'dd-trace'
import flat from 'flat'

const cleanFilename = (filename) => {
  if (filename.includes('&absolutePagePath=')) {
    filename =
      'page ' +
      decodeURIComponent(
        filename.replace(/.+&absolutePagePath=/, '').slice(0, -1)
      )
  }
  filename = filename.replace(/.+!(?!$)/, '')
  return filename
}

const getPackageName = (filename) => {
  const match = /.+[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(
    cleanFilename(filename)
  )
  return match && match[1]
}

/**
 * Create, reports spans recursively with its inner child spans.
 */
const reportSpanRecursively = (tracer, trace, parentSpan) => {
  // build-* span contains tags with path to the modules, trying to clean up if possible
  const isBuildModule = trace.name.startsWith('build-module-')
  if (isBuildModule) {
    trace.packageName = getPackageName(trace.tags.name)
    // replace name to cleaned up pkg name
    trace.tags.name = trace.packageName
    if (trace.children) {
      const queue = [...trace.children]
      trace.children = []
      for (const e of queue) {
        if (e.name.startsWith('build-module-')) {
          const pkgName = getPackageName(e.tags.name)
          if (!trace.packageName || pkgName !== trace.packageName) {
            trace.children.push(e)
          } else {
            if (e.children) queue.push(...e.children)
          }
        }
      }
    }
  }

  /**
   * interface TraceEvent {
   *  traceId: string;
   *  parentId: number;
   *  name: string;
   *  id: number;
   *  startTime: number;
   *  timestamp: number;
   *  duration: number;
   *  tags: Record<string, any>
   * }
   */
  let span = tracer.startSpan(trace.name, {
    startTime: trace.startTime,
    childOf: parentSpan,
    tags: Object.keys(trace?.tags).length > 0 ? trace?.tags : undefined,
  })

  // Spans should be reported in chronological order
  trace.children?.sort((a, b) => a.startTime - b.startTime)
  trace.children?.forEach((childTrace) =>
    reportSpanRecursively(tracer, childTrace, span)
  )

  span.finish(trace.startTime + trace.duration / 1000)
  return span
}

/**
 * Read generated trace from file system, augment & sent it to the remote tracer.
 */
const collectTraces = async (filePath, metadata) => {
  const tracer = Tracer.init({
    tags: metadata,
    // Setting external env variable `DD_TRACE_DEBUG=true` will emit this log
    logLevel: 'error',
    // TODO: this is due to generated trace have excessive numbers of spans
    // for build-module-*, using default flush causes overflow to the agent.
    flushInterval: 20,
    flushMinSpans: 10,
  })

  const readLineInterface = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  const traces = new Map()
  const rootTraces = []

  // Input trace file contains newline-separated sets of traces, where each line is valid JSON
  // type of Array<TraceEvent>. Read it line-by-line to manually reconstruct trace trees.
  //
  // We have to read through end of the trace -
  // Trace events in the input file can appear out of order, so we need to remodel the shape of the span tree before reporting
  for await (const line of readLineInterface) {
    JSON.parse(line).forEach((trace) => traces.set(trace.id, trace))
  }

  // Link inner, child spans to the parents to reconstruct span with correct relations
  for (const event of traces.values()) {
    if (event.parentId) {
      event.parent = traces.get(event.parentId)
      if (event.parent) {
        if (!event.parent.children) event.parent.children = []
        event.parent.children.push(event)
      }
    }

    if (!event.parent) {
      rootTraces.push(event)
    }
  }

  for (const trace of rootTraces) {
    reportSpanRecursively(tracer, trace)
  }
}

/**
 * Naively validate, collect necessary args.
 */
const validateArgs = async () => {
  const { DD_ENV, DD_SERVICE, DATA_DOG_API_KEY } = process.env

  if (!DATA_DOG_API_KEY) {
    console.log(
      "Skipping trace collection, api key is not available. Ensure 'DATA_DOG_API_KEY' env variable is set."
    )
    return
  }

  if (!DD_ENV || !DD_SERVICE) {
    throw new Error(
      `Could not find proper environment variables. Ensure to set DD_ENV / DD_SERVICE`
    )
  }

  // Collect necessary default metadata. Script should pass cli args as in order of
  // - trace file to read
  // - which command ran to generated trace (`build`, `dev`, ...)
  // - short sha for the commit
  // - path to next.config.js (optional)
  const [, , traceFilePath, command, commit, configFilePath] = process.argv
  const config = configFilePath
    ? (await import(path.resolve(process.cwd(), configFilePath))).default
    : {}

  if (!traceFilePath || !command || !commit) {
    throw new Error(
      `Cannot collect traces without necessary metadata.
Try to run script with below args:

node trace-dd.mjs tracefilepath command commit [configfilepath]`
    )
  }

  const metadata = {
    command,
    commit,
    // TODO: it is unclear, but some of nested object seems not supported
    nextjs_config: flat.flatten(config),
  }

  return [traceFilePath, metadata]
}

validateArgs()
  .then(([traceFilePath, metadata]) => collectTraces(traceFilePath, metadata))
  .catch((e) => {
    console.error(`Failed to collect traces`)
    console.error(e)
  })
