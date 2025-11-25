import path from 'path'

import { Worker } from '../../lib/worker'
import { NextBuildContext } from '../build-context'

async function turbopackBuildWithWorker(): ReturnType<
  typeof import('./impl').turbopackBuild
> {
  try {
    const worker = new Worker(path.join(__dirname, 'impl.js'), {
      exposedMethods: ['workerMain', 'waitForShutdown'],
      enableWorkerThreads: true,
      debuggerPortOffset: -1,
      isolatedMemory: false,
      numWorkers: 1,
      maxRetries: 0,
      forkOptions: {
        env: {
          NEXT_PRIVATE_BUILD_WORKER: '1',
        },
      },
    }) as Worker & typeof import('./impl')
    const {
      nextBuildSpan,
      // Config is not serializable and is loaded in the worker.
      config: _config,
      ...prunedBuildContext
    } = NextBuildContext
    const { buildTraceContext, duration } = await worker.workerMain({
      buildContext: prunedBuildContext,
    })

    return {
      // destroy worker when Turbopack has shutdown so it's not sticking around using memory
      // We need to wait for shutdown to make sure filesystem cache is flushed
      shutdownPromise: worker.waitForShutdown().then(() => {
        worker.end()
      }),
      buildTraceContext,
      duration,
    }
  } catch (err: any) {
    // When the error is a serialized `Error` object we need to recreate the `Error` instance
    // in order to keep the consistent error reporting behavior.
    if (err.type === 'Error') {
      const error = new Error(err.message)
      if (err.name) {
        error.name = err.name
      }
      if (err.cause) {
        error.cause = err.cause
      }
      error.message = err.message
      error.stack = err.stack
      throw error
    }
    throw err
  }
}

export function turbopackBuild(
  withWorker: boolean
): ReturnType<typeof import('./impl').turbopackBuild> {
  const nextBuildSpan = NextBuildContext.nextBuildSpan!
  return nextBuildSpan.traceChild('run-turbopack').traceAsyncFn(async () => {
    if (withWorker) {
      return await turbopackBuildWithWorker()
    } else {
      const build = (require('./impl') as typeof import('./impl'))
        .turbopackBuild
      return await build()
    }
  })
}
