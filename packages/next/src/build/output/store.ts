import createStore from 'next/dist/compiled/unistore'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { type Span, flushAllTraces, trace } from '../../trace'
import { teardownDhatProfiler, teardownTraceSubscriber } from '../swc'
import * as Log from './log'

const MAX_LOG_SKIP_DURATION = 500 // 500ms

export type OutputState =
  | { bootstrap: true; appUrl: string | null; bindAddr: string | null }
  | ({ bootstrap: false; appUrl: string | null; bindAddr: string | null } & (
      | {
          loading: true
          trigger: string | undefined
          url: string | undefined
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

export function formatTrigger(trigger: string) {
  // Format dynamic sitemap routes to simpler file path
  // e.g., /sitemap.xml[] -> /sitemap.xml
  if (trigger.includes('[__metadata_id__]')) {
    trigger = trigger.replace('/[__metadata_id__]', '/[id]')
  }

  if (trigger.length > 1 && trigger.endsWith('/')) {
    trigger = trigger.slice(0, -1)
  }
  return trigger
}

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
let triggerUrl: string | undefined = undefined
let loadingLogTimer: NodeJS.Timeout | null = null
let traceSpan: Span | null = null

store.subscribe((state) => {
  if (!hasStoreChanged(state)) {
    return
  }

  if (state.bootstrap) {
    return
  }

  if (state.loading) {
    if (state.trigger) {
      trigger = formatTrigger(state.trigger)
      triggerUrl = state.url
      if (trigger !== 'initial') {
        traceSpan = trace('compile-path', undefined, {
          trigger: trigger,
        })
        if (!loadingLogTimer) {
          // Only log compiling if compiled is not finished in 3 seconds
          loadingLogTimer = setTimeout(() => {
            if (
              triggerUrl &&
              triggerUrl !== trigger &&
              process.env.NEXT_TRIGGER_URL
            ) {
              Log.wait(`Compiling ${trigger} (${triggerUrl}) ...`)
            } else {
              Log.wait(`Compiling ${trigger} ...`)
            }
          }, MAX_LOG_SKIP_DURATION)
        }
      }
    }
    if (startTime === 0) {
      startTime = Date.now()
    }
    return
  }

  if (state.errors) {
    // Log compilation errors
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
    teardownDhatProfiler()
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
    teardownDhatProfiler()
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
    if (traceSpan) {
      traceSpan.stop()
      traceSpan = null
    }
    Log.event(
      `Compiled${trigger ? ' ' + trigger : ''}${timeMessage}${modulesMessage}`
    )
    trigger = ''
  }

  // Ensure traces are flushed after each compile in development mode
  flushAllTraces()
  teardownTraceSubscriber()
  teardownDhatProfiler()
})
