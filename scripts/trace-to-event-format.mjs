import { createReadStream, createWriteStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'
import { EOL } from 'os'

const createEvent = (trace, ph, cat) => ({
  name: trace.name,
  // Category. We don't collect this for now.
  cat: cat ?? '-',
  ts: trace.timestamp,
  // event category. We only use duration events (B/E) for now.
  ph,
  // process id. We don't collect this for now, putting arbitrary numbers.
  pid: 1,
  // thread id. We don't collect this for now, putting arbitrary numbers.
  tid: 10,
  args: trace.tags,
})

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
const reportSpanRecursively = (stream, trace, parentSpan) => {
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
  stream.write(JSON.stringify(createEvent(trace, 'B')))
  stream.write(',')

  // Spans should be reported in chronological order
  trace.children?.sort((a, b) => a.startTime - b.startTime)
  trace.children?.forEach((childTrace) =>
    reportSpanRecursively(stream, childTrace)
  )

  stream.write(
    JSON.stringify(
      createEvent(
        {
          ...trace,
          timestamp: trace.timestamp + trace.duration,
        },
        'E'
      )
    )
  )
  stream.write(',')
}

/**
 * Read generated trace from file system, augment & sent it to the remote tracer.
 */
const collectTraces = async (filePath, outFilePath, metadata) => {
  const readLineInterface = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  const writeStream = createWriteStream(outFilePath)
  writeStream.write(`[${EOL}`)

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
    reportSpanRecursively(writeStream, trace)
  }

  writeStream.write(
    JSON.stringify({
      name: 'trace',
      ph: 'M',
      args: metadata,
    })
  )
  writeStream.write(`${EOL}]`)
}

/**
 * Naively validate, collect necessary args.
 */
const validateArgs = async () => {
  // Collect necessary default metadata. Script should pass cli args as in order of
  // - trace file to read
  // - output file path (optional)
  // - path to next.config.js (optional)
  const [, , traceFilePath, outFile, configFilePath] = process.argv
  const outFilePath = outFile ?? `${traceFilePath}.event`
  const config = configFilePath
    ? (await import(path.resolve(process.cwd(), configFilePath))).default
    : {}

  if (!traceFilePath) {
    throw new Error(
      `Cannot collect traces without necessary metadata.
Try to run script with below args:

node trace-to-event-format.mjs tracefilepath [outfilepath] [configfilepath]`
    )
  }

  const metadata = {
    config,
  }

  return [traceFilePath, outFilePath, metadata]
}

validateArgs()
  .then(([traceFilePath, outFilePath, metadata]) =>
    collectTraces(traceFilePath, outFilePath, metadata)
  )
  .catch((e) => {
    console.error(`Failed to generate traces`)
    console.error(e)
  })
