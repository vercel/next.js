import createStore from 'next/dist/compiled/unistore'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import chalk from 'chalk'

import * as Log from './log'

export type Address = {
  appUrl: string | null
  bindAddr: string | null
  appUrlNet: string | null
}
export type OutputState =
  | (Address & { bootstrap: true })
  | (Address & { bootstrap: false } & (
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
            `AMP bind syntax [${prop}]='' is not supported in JSX, use 'data-amp-bind-${prop}' instead. https://nextjs.org/docs/messages/amp-bind-jsx-alt`
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
