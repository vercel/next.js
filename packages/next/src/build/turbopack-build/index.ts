import path from 'path'
import {
  formatNodeOptions,
  getParsedNodeOptionsWithoutInspect,
} from '../../server/lib/utils'
import { Worker } from '../../lib/worker'
import { NextBuildContext } from '../build-context'

async function turbopackBuildWithWorker() {
  const nodeOptions = getParsedNodeOptionsWithoutInspect()

  try {
    const worker = new Worker(path.join(__dirname, 'impl.js'), {
      exposedMethods: ['workerMain', 'waitForShutdown'],
      numWorkers: 1,
      maxRetries: 0,
      forkOptions: {
        env: {
          ...process.env,
          NEXT_PRIVATE_BUILD_WORKER: '1',
          NODE_OPTIONS: formatNodeOptions(nodeOptions),
        },
      },
    }) as Worker & typeof import('./impl')
    const { nextBuildSpan, ...prunedBuildContext } = NextBuildContext
    const result = await worker.workerMain({
      buildContext: prunedBuildContext,
    })

    // destroy worker when Turbopack has shutdown so it's not sticking around using memory
    // We need to wait for shutdown to make sure persistent cache is flushed
    result.shutdownPromise = worker.waitForShutdown().then(() => {
      worker.end()
    })

    return result
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
  if (withWorker) {
    return turbopackBuildWithWorker()
  } else {
    const build = (require('./impl') as typeof import('./impl')).turbopackBuild
    return build()
  }
}
