import { COMPILER_INDEXES } from '../../shared/lib/constants'
import * as Log from '../output/log'
import { NextBuildContext } from '../build-context'
import type { BuildTraceContext } from '../webpack/plugins/next-trace-entrypoints-plugin'
import { Worker } from 'next/dist/compiled/jest-worker'
import origDebug from 'next/dist/compiled/debug'
import { ChildProcess } from 'child_process'
import path from 'path'

const debug = origDebug('next:build:webpack-build')

async function webpackBuildWithWorker() {
  const {
    config,
    telemetryPlugin,
    buildSpinner,
    nextBuildSpan,
    ...prunedBuildContext
  } = NextBuildContext

  const getWorker = (compilerName: string) => {
    const _worker = new Worker(path.join(__dirname, 'impl.js'), {
      exposedMethods: ['workerMain'],
      numWorkers: 1,
      maxRetries: 0,
      forkOptions: {
        env: {
          ...process.env,
          NEXT_PRIVATE_BUILD_WORKER: '1',
        },
      },
    }) as Worker & typeof import('./impl')
    _worker.getStderr().pipe(process.stderr)
    _worker.getStdout().pipe(process.stdout)

    for (const worker of ((_worker as any)._workerPool?._workers || []) as {
      _child: ChildProcess
    }[]) {
      worker._child.on('exit', (code, signal) => {
        if (code || signal) {
          console.error(
            `Compiler ${compilerName} unexpectedly exited with code: ${code} and signal: ${signal}`
          )
        }
      })
    }

    return _worker
  }

  const combinedResult = {
    duration: 0,
    buildTraceContext: {} as BuildTraceContext,
  }
  // order matters here
  const ORDERED_COMPILER_NAMES = [
    'server',
    'edge-server',
    'client',
  ] as (keyof typeof COMPILER_INDEXES)[]

  for (const compilerName of ORDERED_COMPILER_NAMES) {
    const worker = getWorker(compilerName)

    const curResult = await worker.workerMain({
      buildContext: prunedBuildContext,
      compilerName,
    })
    // destroy worker so it's not sticking around using memory
    await worker.end()

    // Update plugin state
    prunedBuildContext.pluginState = curResult.pluginState

    prunedBuildContext.serializedPagesManifestEntries = {
      edgeServerAppPaths:
        curResult.serializedPagesManifestEntries?.edgeServerAppPaths,
      edgeServerPages:
        curResult.serializedPagesManifestEntries?.edgeServerPages,
      nodeServerAppPaths:
        curResult.serializedPagesManifestEntries?.nodeServerAppPaths,
      nodeServerPages:
        curResult.serializedPagesManifestEntries?.nodeServerPages,
    }

    combinedResult.duration += curResult.duration

    if (curResult.buildTraceContext?.entriesTrace) {
      const { entryNameMap } = curResult.buildTraceContext.entriesTrace!

      if (entryNameMap) {
        combinedResult.buildTraceContext.entriesTrace =
          curResult.buildTraceContext.entriesTrace
        combinedResult.buildTraceContext.entriesTrace!.entryNameMap = new Map(
          entryNameMap
        )
      }

      if (curResult.buildTraceContext?.chunksTrace) {
        const { entryNameFilesMap } = curResult.buildTraceContext.chunksTrace!

        if (entryNameFilesMap) {
          combinedResult.buildTraceContext.chunksTrace =
            curResult.buildTraceContext.chunksTrace!

          combinedResult.buildTraceContext.chunksTrace!.entryNameFilesMap =
            new Map(entryNameFilesMap)
        }
      }
    }
  }
  buildSpinner?.stopAndPersist()
  Log.event('Compiled successfully')

  return combinedResult
}

export async function webpackBuild() {
  const config = NextBuildContext.config!

  if (config.experimental.webpackBuildWorker) {
    debug('using separate compiler workers')
    return await webpackBuildWithWorker()
  } else {
    debug('building all compilers in same process')
    const webpackBuildImpl = require('./impl').webpackBuildImpl
    return await webpackBuildImpl()
  }
}
