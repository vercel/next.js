import createStore from 'next/dist/compiled/unistore'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { flushAllTraces } from '../../trace'

import * as Log from './log'

export type OutputState =
  | { bootstrap: true; appUrl: string | null; bindAddr: string | null }
  | ({ bootstrap: false; appUrl: string | null; bindAddr: string | null } & (
      | { loading: true }
      | {
          loading: false
          typeChecking: boolean
          errors: string[] | null
          warnings: string[] | null
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

store.subscribe((state) => {
  if (!hasStoreChanged(state)) {
    return
  }

  if (state.bootstrap) {
    if (state.appUrl) {
      Log.ready(`started server on ${state.bindAddr}, url: ${state.appUrl}`)
    }
    return
  }

  if (state.loading) {
    Log.wait('compiling...')
    if (startTime === 0) startTime = Date.now()
    return
  }

  if (state.errors) {
    Log.error(state.errors[0])

    const cleanError = stripAnsi(state.errors[0])
    if (cleanError.indexOf('SyntaxError') > -1) {
      const matches = cleanError.match(/\[.*\]=/)
      if (matches) {
        for (const match of matches) {
          const prop = (match.split(']').shift() || '').substr(1)
          console.log(
            `AMP bind syntax [${prop}]='' is not supported in JSX, use 'data-amp-bind-${prop}' instead. https://nextjs.org/docs/messages/amp-bind-jsx-alt`
          )
        }
        return
      }
    }

    // Ensure traces are flushed after each compile in development mode
    flushAllTraces()
    return
  }

  let timeMessage = ''
  if (startTime) {
    const time = Date.now() - startTime
    startTime = 0

    timeMessage =
      time > 2000 ? ` in ${Math.round(time / 100) / 10} s` : ` in ${time} ms`
  }

  if (state.warnings) {
    Log.warn(state.warnings.join('\n\n'))
    // Ensure traces are flushed after each compile in development mode
    flushAllTraces()
    return
  }

  if (state.typeChecking) {
    Log.info(
      `bundled successfully${timeMessage}, waiting for typecheck results...`
    )
    return
  }

  Log.event(`compiled successfully${timeMessage}`)
  // Ensure traces are flushed after each compile in development mode
  flushAllTraces()
})
