import createStore from 'next/dist/compiled/unistore'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { flushAllTraces } from '../../trace'
import {
  teardownCrashReporter,
  teardownHeapProfiler,
  teardownTraceSubscriber,
} from '../swc'
import * as Log from './log'
import chalk from '../../lib/chalk'

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
          partial: 'client and server' | undefined
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
let lastTime = Date.now()

store.subscribe((state) => {
  if (!hasStoreChanged(state)) {
    return
  }

  if (state.bootstrap) {
    if (state.appUrl) {
      Log.bootstrap(`- Local: ${chalk.bold(state.appUrl)}`)
      Log.bootstrap(`- Network: ${chalk.bold(state.bindAddr)}`)
    }
    return
  }

  if (state.loading) {
    if (state.trigger) {
      if (state.trigger !== 'initial') {
        Log.wait(`compiling ${state.trigger}...`)
      }
    } else {
      if (Date.now() - lastTime > 10 * 1000) {
        Log.wait('compiling...')
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
      time > 2000 ? ` in ${Math.round(time / 100) / 10}s` : ` in ${time} ms`
  }

  let modulesMessage = ''
  if (state.totalModulesCount) {
    modulesMessage = ` (${state.totalModulesCount} modules)`
  }

  let partialMessage = ''
  if (state.partial) {
    partialMessage = ` ${state.partial}`
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
      `bundled${partialMessage} ${timeMessage}${modulesMessage}, type checking...`
    )
    return
  }

  if (partialMessage !== ' client and server') {
    Log.event(`compiled${partialMessage} ${timeMessage}${modulesMessage}`)
  }
  // Ensure traces are flushed after each compile in development mode
  flushAllTraces()
  teardownTraceSubscriber()
  teardownHeapProfiler()
  teardownCrashReporter()
})

store.subscribe((state) => {
  lastTime = Date.now()
})
