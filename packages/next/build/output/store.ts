import createStore from 'next/dist/compiled/unistore'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import chalk from 'chalk'
import { flushAllTraces } from '../../trace'
import { teardownCrashReporter, teardownTraceSubscriber } from '../swc'
import * as Log from './log'

export type Address = {
  appUrl: string | null
  bindAddr: string | null
  appUrlNet: string | null
}
export type OutputState =
  | (Address & { bootstrap: true })
  | (Address & { bootstrap: false } & (
        | {
            loading: true
            trigger: string | undefined
          }
        | {
            loading: false
            typeChecking: boolean
            partial: 'client and server' | undefined
            modules: number
            errors: string[] | null
            warnings: string[] | null
            hasEdgeServer: boolean
          }
      ))

export const store = createStore<OutputState>({
  appUrl: null,
  bindAddr: null,
  bootstrap: true,
  appUrlNet: null,
})

let lastStore: OutputState = {
  appUrl: null,
  bindAddr: null,
  bootstrap: true,
  appUrlNet: null,
}
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

store.subscribe((state) => {
  if (!hasStoreChanged(state)) {
    return
  }

  if (state.bootstrap) {
    const space = ' '.repeat(8)
    let message = `started server on - \n`

    if (state.appUrl) {
      message +=
        space +
        `local - url: ${chalk.green(state.appUrl)}, on - ${state.bindAddr}\n`
    }

    if (state.appUrlNet) {
      message += space + `network - url: ${chalk.green(state.appUrlNet)}`
    }

    Log.ready(message)
    return
  }

  if (state.loading) {
    if (state.trigger) {
      if (state.trigger !== 'initial') {
        Log.wait(`compiling ${state.trigger}...`)
      }
    } else {
      Log.wait('compiling...')
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
  if (state.modules) {
    modulesMessage = ` (${state.modules} modules)`
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
    teardownCrashReporter()
    return
  }

  if (state.typeChecking) {
    Log.info(
      `bundled${partialMessage} successfully${timeMessage}${modulesMessage}, waiting for typecheck results...`
    )
    return
  }

  Log.event(
    `compiled${partialMessage} successfully${timeMessage}${modulesMessage}`
  )
  // Ensure traces are flushed after each compile in development mode
  flushAllTraces()
  teardownTraceSubscriber()
  teardownCrashReporter()
})
