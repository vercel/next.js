import type { NodeNextRequest, NodeNextResponse } from './base-http/node'
import type { Session } from 'inspector'

let session: Session | null = null
const PROFILING_ENABLED = !!process.env.NEXTJS_PROFILING
const SAMPLING_INTERVAL = process.env.NEXTJS_PROFILING_INTERVAL || 100

function patchResponseObject(res: NodeNextResponse) {
  const originalEnd = res.originalResponse.end.bind(res.originalResponse)
  res.originalResponse.setHeader('x-nextjs-trace', '1')

  // @ts-ignore
  res.originalResponse.write = () => {}

  res.originalResponse.setHeader = () => {}

  // @ts-ignore
  res.originalResponse.end = () => {
    maybeStopProfiling().then((result) => {
      originalEnd(result)
    })
  }
}

function promisify<T>(
  fn: (cb: (err: Error | null, result?: T) => void) => void
) {
  return new Promise<T>((resolve, reject) => {
    fn((err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(result!)
      }
    })
  })
}

async function maybeStopProfiling() {
  if (!session) {
    return
  }

  const { profile } = await promisify<{
    profile: any
  }>((cb) => session!.post('Profiler.stop', cb))
  await promisify((cb) => session!.post('Profiler.disable', cb))

  // not sure of the cost of keeping a session around, but it's best to clean up
  session!.disconnect()
  session = null

  return JSON.stringify(profile)
}

async function startProfiling() {
  if (session) {
    return
  }

  const inspector = await import('inspector')

  session = new inspector.Session()
  session.connect()

  await promisify((cb) =>
    session!.post(
      'Profiler.setSamplingInterval',
      {
        interval: SAMPLING_INTERVAL,
      },
      cb
    )
  )
  await promisify((cb) => session!.post('Profiler.enable', cb))
  await promisify((cb) => session!.post('Profiler.start', cb))

  setTimeout(() => {
    maybeStopProfiling()
  }, 5000)
}

export async function maybeStartProfiling() {
  if (PROFILING_ENABLED) {
    try {
      await startProfiling()
    } catch (err) {
      console.error(err)
    }
  }
}

export async function maybeStartProfilingRequest(
  req: NodeNextRequest,
  res: NodeNextResponse
) {
  if (!PROFILING_ENABLED) {
    return
  }

  if (req.headers['x-nextjs-trace']) {
    res.setHeader('x-nextjs-trace', '1')
    await startProfiling()
    patchResponseObject(res)
  } else {
    // we want to disable profiling incase it was started on server start
    await maybeStopProfiling()
  }
}
