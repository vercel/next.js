import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { EOL } from 'node:os'
import { pathToFileURL } from 'node:url'

const createEvent = (trace, ph, cat) => ({
  name: trace.name,
  cat: cat ?? '-',
  ts: trace.timestamp,
  ph,
  pid: 1,
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
  return filename.replace(/.+!(?!$)/, '')
}

const getPackageName = (filename) => {
  const match = /.+[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(
    cleanFilename(filename)
  )
  return match && match[1]
}

const reportSpanRecursively = (stream, trace) => {
  const isBuildModule = trace.name.startsWith('build-module-')
  if (isBuildModule) {
    trace.packageName = getPackageName(trace.tags.name)
    trace.tags.name = trace.packageName
    if (trace.children) {
      const queue = [...trace.children]
      trace.children = []
      for (const e of queue) {
        if (e.name.startsWith('build-module-')) {
          const pkgName = getPackageName(e.tags.name)
          if (!trace.packageName || pkgName !== trace.packageName) {
            trace.children.push(e)
          } else if (e.children) {
            queue.push(...e.children)
          }
        }
      }
    }
  }

  stream.write(JSON.stringify(createEvent(trace, 'B')))
  stream.write(',')

  trace.children?.sort((a, b) => a.startTime - b.startTime)
  trace.children?.forEach((childTrace) =>
    reportSpanRecursively(stream, childTrace)
  )

  stream.write(
    JSON.stringify({
      ...createEvent(
        {
          ...trace,
          timestamp: trace.timestamp + trace.duration,
        },
        'E'
      ),
    })
  )
  stream.write(',')
}

const collectTraces = async (filePath, outFilePath, metadata) => {
  const readLineInterface = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  const writeStream = createWriteStream(outFilePath)
  writeStream.write(`[${EOL}`)

  const traces = new Map()
  const rootTraces = []

  for await (const line of readLineInterface) {
    JSON.parse(line).forEach((trace) => traces.set(trace.id, trace))
  }

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

const validateArgs = async () => {
  const [, , traceFilePath, outFile, configFilePath] = process.argv
  const outFilePath = outFile ?? `${traceFilePath}.event`

  const config = configFilePath
    ? (await import(pathToFileURL(resolve(configFilePath)))).default
    : {}

  if (!traceFilePath) {
    throw new Error(
      `Cannot collect traces without necessary metadata.\nTry to run script with below args:\n\nnode trace-to-event-format.mjs tracefilepath [outfilepath] [configfilepath]`
    )
  }

  const metadata = { config }
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
