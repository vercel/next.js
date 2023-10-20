import createStore from 'next/dist/compiled/unistore'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { flushAllTraces } from '../../trace'
import {
  teardownCrashReporter,
  teardownHeapProfiler,
  teardownTraceSubscriber,
} from '../swc'
import * as Log from './log'

const MAX_DURATION = 3 * 1000

export type OutputState =
  | { bootstrap: true; appUrl: string | null; bindAddr: string | null }
  | ({ bootstrap: false; appUrl: string | null; bindAddr: string | null } & (
      | {
          loading: true
          trigger: string | undefined
        }
      | {
          loading: false
          typeChecking: boolean
          totalModulesCount: number
          errors: string[] | null
          warnings: string[] | null
          hasEdgeServer: boolean
        }
    ))

export const store = createStore<OutputState>({
  appUrl: null,
  bindAddr: null,
  bootstrap: true,
})

let lastStore: OutputState = { appUrl: null, bindAddr: null, bootstrap: true }
function hasStoreChanged(nextStore: OutputState) {
  if (
    (
      [
        ...new Set([...Object.keys(lastStore), ...Object.keys(nextStore)]),
      ] as Array<keyof OutputState>
    ).every((key) => Object.is(lastStore[key], nextStore[key]))
  ) {
    return false
  }

  lastStore = nextStore
  return true
}

let startTime = 0
let trigger = '' // default, use empty string for trigger
let loadingLogTimer: NodeJS.Timeout | null = null

store.subscribe((state) => {
  if (!hasStoreChanged(state)) {
    return
  }

  if (state.bootstrap) {
    return
  }

  if (state.loading) {
    if (state.trigger) {
      trigger = state.trigger
      if (trigger !== 'initial') {
        if (!loadingLogTimer) {
          // Only log compiling if compiled is not finished in 3 seconds
          loadingLogTimer = setTimeout(() => {
            Log.wait(`Compiling ${trigger} ...`)
          }, MAX_DURATION)
        }
      }
    }
    if (startTime === 0) {
      startTime = Date.now()
    }
    return
  }

  if (state.errors) {
    Log.error(state.errors[0])

    const cleanError = stripAnsi(state.errors[0])
    if (cleanError.indexOf('SyntaxError') > -1) {
      const matches = cleanError.match(/\[.*\]=/)
      if (matches) {
        for (const match of matches) {
          const prop = (match.split(']').shift() || '').slice(1)
          console.log(
            `AMP bind syntax [${prop}]='' is not supported in JSX, use 'data-amp-bind-${prop}' instead. https://nextjs.org/docs/messages/amp-bind-jsx-alt`
          )
        }
        return
      }
    }
    startTime = 0
    // Ensure traces are flushed after each compile in development mode
    flushAllTraces()
    teardownTraceSubscriber()
    teardownHeapProfiler()
    teardownCrashReporter()
    return
  }

  let timeMessage = ''
  if (startTime) {
    const time = Date.now() - startTime
    startTime = 0

    timeMessage =
      ' ' +
      (time > 2000 ? `in ${Math.round(time / 100) / 10}s` : `in ${time}ms`)
  }

  let modulesMessage = ''
  if (state.totalModulesCount) {
    modulesMessage = ` (${state.totalModulesCount} modules)`
  }

  if (state.warnings) {
    Log.warn(state.warnings.join('\n\n'))
    // Ensure traces are flushed after each compile in development mode
    flushAllTraces()
    teardownTraceSubscriber()
    teardownHeapProfiler()
    teardownCrashReporter()
    return
  }

  if (state.typeChecking) {
    Log.info(
      `bundled ${trigger}${timeMessage}${modulesMessage}, type checking...`
    )
    return
  }

  if (trigger === 'initial') {
    trigger = ''
  } else {
    if (loadingLogTimer) {
      clearTimeout(loadingLogTimer)
      loadingLogTimer = null
    }
    Log.event(
      `Compiled${trigger ? ' ' + trigger : ''}${timeMessage}${modulesMessage}`
    )
    trigger = ''
  }

  // Ensure traces are flushed after each compile in development mode
  flushAllTraces()
  teardownTraceSubscriber()
  teardownHeapProfiler()
  teardownCrashReporter()
})
