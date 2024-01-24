import type { COMPILER_INDEXES } from '../../shared/lib/constants'
import * as Log from '../output/log'
import { NextBuildContext } from '../build-context'
import type { BuildTraceContext } from '../webpack/plugins/next-trace-entrypoints-plugin'
import { Worker } from 'next/dist/compiled/jest-worker'
import origDebug from 'next/dist/compiled/debug'
import type { ChildProcess } from 'child_process'
import path from 'path'
import { exportTraceState, recordTraceEvents } from '../../trace'

const debug = origDebug('next:build:webpack-build')

const ORDERED_COMPILER_NAMES = [
  'server',
  'edge-server',
  'client',
] as (keyof typeof COMPILER_INDEXES)[]

let pluginState: Record<any, any> = {}

function deepMerge(target: any, source: any) {
  const result = { ...target, ...source }
  for (const key of Object.keys(result)) {
    result[key] = Array.isArray(target[key])
      ? (target[key] = [...target[key], ...(source[key] || [])])
      : typeof target[key] == 'object' && typeof source[key] == 'object'
      ? deepMerge(target[key], source[key])
      : result[key]
  }
  return result
}

async function webpackBuildWithWorker(
  compilerNamesArg: typeof ORDERED_COMPILER_NAMES | null
) {
  const compilerNames = compilerNamesArg || ORDERED_COMPILER_NAMES
  const { nextBuildSpan, ...prunedBuildContext } = NextBuildContext

  prunedBuildContext.pluginState = pluginState

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
        if (code || (signal && signal !== 'SIGINT')) {
          debug(
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

  for (const compilerName of compilerNames) {
    const worker = getWorker(compilerName)

    const curResult = await worker.workerMain({
      buildContext: prunedBuildContext,
      compilerName,
      traceState: {
        ...exportTraceState(),
        defaultParentSpanId: nextBuildSpan?.getId(),
        shouldSaveTraceEvents: true,
      },
    })
    if (nextBuildSpan && curResult.debugTraceEvents) {
      recordTraceEvents(curResult.debugTraceEvents)
    }
    // destroy worker so it's not sticking around using memory
    await worker.end()

    // Update plugin state
    pluginState = deepMerge(pluginState, curResult.pluginState)
    prunedBuildContext.pluginState = pluginState

    if (curResult.telemetryState) {
      NextBuildContext.telemetryState = curResult.telemetryState
    }

    combinedResult.duration += curResult.duration

    if (curResult.buildTraceContext?.entriesTrace) {
      const { entryNameMap } = curResult.buildTraceContext.entriesTrace!

      if (entryNameMap) {
        combinedResult.buildTraceContext.entriesTrace =
          curResult.buildTraceContext.entriesTrace
        combinedResult.buildTraceContext.entriesTrace!.entryNameMap =
          entryNameMap
      }

      if (curResult.buildTraceContext?.chunksTrace) {
        const { entryNameFilesMap } = curResult.buildTraceContext.chunksTrace!

        if (entryNameFilesMap) {
          combinedResult.buildTraceContext.chunksTrace =
            curResult.buildTraceContext.chunksTrace!

          combinedResult.buildTraceContext.chunksTrace!.entryNameFilesMap =
            entryNameFilesMap
        }
      }
    }
  }

  if (compilerNames.length === 3) {
    Log.event('Compiled successfully')
  }

  return combinedResult
}

export function webpackBuild(
  withWorker: boolean,
  compilerNames: typeof ORDERED_COMPILER_NAMES | null
): ReturnType<typeof webpackBuildWithWorker> {
  if (withWorker) {
    debug('using separate compiler workers')
    return webpackBuildWithWorker(compilerNames)
  } else {
    debug('building all compilers in same process')
    const webpackBuildImpl = require('./impl').webpackBuildImpl
    return webpackBuildImpl(null, null)
  }
}
