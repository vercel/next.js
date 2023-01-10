import type { NodeNextRequest, NodeNextResponse } from './base-http/node'
import type { Session } from 'inspector'

let session: Session | null = null
const PROFILER_ENABLED = !!process.env.NEXTJS_PROFILER_ENABLED
const SAMPLING_INTERVAL = process.env.NEXTJS_PROFILER_INTERVAL
  ? parseInt(process.env.NEXTJS_PROFILER_INTERVAL, 10)
  : 100

const promisify = <T>(
  fn: (cb: (err: Error | null, result?: T) => void) => void
) =>
  new Promise<T>((resolve, reject) => {
    fn((err, result) => {
      err ? reject(err) : resolve(result!)
    })
  })

async function maybeStopProfiler() {
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

async function startProfiler() {
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
    maybeStopProfiler()
  }, 5000)
}

export async function maybeStartProfiler() {
  if (PROFILER_ENABLED) {
    await startProfiler()
  }
}

export async function maybeStartProfilingRequest(
  req: NodeNextRequest,
  res: NodeNextResponse
) {
  if (!PROFILER_ENABLED) {
    return
  }

  if (req.headers['x-nextjs-trace']) {
    res.setHeader('x-nextjs-trace', '1')
    await startProfiler()
    patchResponseObject(res)
  } else {
    // we want to disable profiler incase it was started on server start
    await maybeStopProfiler()
  }
}
