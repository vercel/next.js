import type { COMPILER_INDEXES } from '../../shared/lib/constants'
import * as Log from '../output/log'
import { NextBuildContext } from '../build-context'
import type { BuildTraceContext } from '../webpack/plugins/next-trace-entrypoints-plugin'
import { Worker } from '../../lib/worker'
import origDebug from 'next/dist/compiled/debug'
import path from 'path'
import { exportTraceState, recordTraceEvents } from '../../trace'
import { mergeUseCacheTrackers } from '../webpack/plugins/telemetry-plugin/use-cache-tracker-utils'
import { durationToString } from '../duration-to-string'

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

  const combinedResult = {
    duration: 0,
    buildTraceContext: {} as BuildTraceContext,
  }

  for (const compilerName of compilerNames) {
    const worker = new Worker(path.join(__dirname, 'impl.js'), {
      exposedMethods: ['workerMain'],
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
      NextBuildContext.telemetryState = {
        ...curResult.telemetryState,
        useCacheTracker: mergeUseCacheTrackers(
          NextBuildContext.telemetryState?.useCacheTracker,
          curResult.telemetryState.useCacheTracker
        ),
      }
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
    const durationString = durationToString(combinedResult.duration)
    Log.event(`Compiled successfully in ${durationString}`)
  }

  return combinedResult
}

export async function webpackBuild(
  withWorker: boolean,
  compilerNames: typeof ORDERED_COMPILER_NAMES | null
): Promise<
  | Awaited<ReturnType<typeof webpackBuildWithWorker>>
  | Awaited<ReturnType<typeof import('./impl').webpackBuildImpl>>
> {
  const nextBuildSpan = NextBuildContext.nextBuildSpan!
  return nextBuildSpan.traceChild('run-webpack').traceAsyncFn(async () => {
    if (withWorker) {
      debug('using separate compiler workers')
      return await webpackBuildWithWorker(compilerNames)
    } else {
      debug('building all compilers in same process')
      const webpackBuildImpl = (require('./impl') as typeof import('./impl'))
        .webpackBuildImpl
      const curResult = await webpackBuildImpl(null)

      // Mirror what happens in webpackBuildWithWorker
      if (curResult.telemetryState) {
        NextBuildContext.telemetryState = {
          ...curResult.telemetryState,
          useCacheTracker: mergeUseCacheTrackers(
            NextBuildContext.telemetryState?.useCacheTracker,
            curResult.telemetryState.useCacheTracker
          ),
        }
      }

      return curResult
    }
  })
}
