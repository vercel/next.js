import createStore from 'next/dist/compiled/unistore'
import stripAnsi from 'next/dist/compiled/strip-ansi'

import * as Log from './log'

export type OutputState =
  | { bootstrap: true; appUrl: string | null }
  | ({ bootstrap: false; appUrl: string | null } & (
      | { loading: true }
      | {
          loading: false
          typeChecking: boolean
          errors: string[] | null
          warnings: string[] | null
        }
    ))

export const store = createStore<OutputState>({ appUrl: null, bootstrap: true })

let lastStore: OutputState = { appUrl: null, bootstrap: true }
function hasStoreChanged(nextStore: OutputState) {
  if (
    ([
      ...new Set([...Object.keys(lastStore), ...Object.keys(nextStore)]),
    ] as Array<keyof OutputState>).every((key) =>
      Object.is(lastStore[key], nextStore[key])
    )
  ) {
    return false
  }

  lastStore = nextStore
  return true
}

store.subscribe((state) => {
  if (!hasStoreChanged(state)) {
    return
  }

  if (state.bootstrap) {
    if (state.appUrl) {
      Log.ready(`started server on ${state.appUrl}`)
    }
    return
  }

  if (state.loading) {
    Log.wait('compiling...')
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
            `AMP bind syntax [${prop}]='' is not supported in JSX, use 'data-amp-bind-${prop}' instead. https://err.sh/vercel/next.js/amp-bind-jsx-alt`
          )
        }
        return
      }
    }

    return
  }

  if (state.warnings) {
    Log.warn(state.warnings.join('\n\n'))
    if (state.appUrl) {
      Log.info(`ready on ${state.appUrl}`)
    }
    return
  }

  if (state.typeChecking) {
    Log.info('bundled successfully, waiting for typecheck results...')
    return
  }

  Log.event('compiled successfully')
})
