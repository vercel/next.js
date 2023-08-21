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

const EVENT_FILTER = new Set([
  'client-hmr-latency',
  'hot-reloader',
  'webpack-invalid-client',
  'webpack-invalidated-server',
])

const { NEXT_TRACE_UPLOAD_DEBUG } = process.env

const [, , traceUploadUrl, mode, _isTurboSession, projectDir, distDir] =
  process.argv
const isTurboSession = _isTurboSession === 'true'

type TraceRequestBody = {
  metadata: TraceMetadata
  traces: TraceEvent[][]
}

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

  const traces = new Map<string, TraceEvent[]>()
  for await (const line of readLineInterface) {
    const lineEvents: TraceEvent[] = JSON.parse(line)
    for (const event of lineEvents) {
      if (
        // Always include root spans
        event.parentId === undefined ||
        EVENT_FILTER.has(event.name)
      ) {
        if (
          typeof event.tags.trigger === 'string' &&
          path.isAbsolute(event.tags.trigger)
        ) {
          event.tags.trigger =
            '[project]/' +
            path
              .relative(projectDir, event.tags.trigger)
              .replaceAll(path.sep, '/')
        }

        let trace = traces.get(event.traceId)
        if (trace === undefined) {
          trace = []
          traces.set(event.traceId, trace)
        }
        trace.push(event)
      }
    }
  }

  const body: TraceRequestBody = {
    metadata: {
      commit,
      mode,
      pkgName,
      isTurboSession,
      arch: os.arch(),
      cpus: os.cpus().length,
      platform: os.platform(),
    },
    traces: [...traces.values()],
  }

  if (NEXT_TRACE_UPLOAD_DEBUG) {
    console.log('Sending request with body', JSON.stringify(body, null, 2))
  }

  let res = await fetch(traceUploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (NEXT_TRACE_UPLOAD_DEBUG) {
    console.log('Received response', res.status, await res.json())
  }
})()
