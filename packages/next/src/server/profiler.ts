import v8Profiler from 'v8-profiler-next'
import { NodeNextRequest, NodeNextResponse } from './base-http/node'

let traceInFlight = false
const TRACE_ID = 'nextjs-trace'

export function startProfiler() {
  if (traceInFlight) {
    return
  }

  v8Profiler.deleteAllProfiles()
  v8Profiler.setGenerateType(1)
  v8Profiler.setSamplingInterval(10)
  v8Profiler.startProfiling(TRACE_ID, true, 1)
  traceInFlight = true
  setTimeout(() => {
    maybeStopProfiler()
  }, 10000)
}

async function maybeStopProfiler() {
  if (!traceInFlight) {
    return
  }

  const profile = v8Profiler.stopProfiling(TRACE_ID)
  traceInFlight = false
  return new Promise((resolve, reject) => {
    profile.export((err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    })
  })
}

function patchResponseObject(res: NodeNextResponse) {
  const originalEnd = res.originalResponse.end.bind(res.originalResponse)
  res.originalResponse.setHeader('x-nextjs-trace', '1')

  // @ts-ignore
  res.originalResponse.write = () => {}

  res.originalResponse.setHeader = () => {}

  // @ts-ignore
  res.originalResponse.end = () => {
    maybeStopProfiler().then((result) => {
      originalEnd(result)
    })
  }
}

export function maybeStartProfiler(
  req: NodeNextRequest,
  res: NodeNextResponse
) {
  if (req.headers['x-nextjs-trace']) {
    startProfiler()
    patchResponseObject(res)
  } else {
    maybeStopProfiler()
  }
}
