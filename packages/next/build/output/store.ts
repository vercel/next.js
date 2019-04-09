import chalk from 'chalk'
import createStore from 'next/dist/compiled/unistore'
import { onExit } from './exit'
import stripAnsi from 'strip-ansi'

export type OutputState =
  | { bootstrap: true; appUrl: string | null }
  | ({ bootstrap: false; appUrl: string | null } & (
      | { loading: true }
      | {
          loading: false
          errors: string[] | null
          warnings: string[] | null
        }))

export const store = createStore<OutputState>({ appUrl: null, bootstrap: true })

onExit(() => {
  console.log(`[${chalk.cyan('done')}]`)
})

let lastState: string | null = null
store.subscribe(state => {
  if (state.bootstrap) {
    if (lastState !== 'start') console.log(`[${chalk.cyan('start')}] ...`)
    lastState = 'start'
    return
  }

  if (state.loading) {
    if (lastState !== 'load') console.log(`[${chalk.cyan('build')}] ...`)
    lastState = 'load'
    return
  }

  if (state.errors) {
    const {
      errors: [err = ''],
    } = state
    const newState = `error - ${err.toString()}`
    if (lastState !== newState)
      console.log(`[${chalk.red('error')}]`, state.errors[0])
    lastState = newState

    const cleanError = stripAnsi(state.errors[0])
    if (cleanError.indexOf('SyntaxError') > -1) {
      const matches = cleanError.match(/\[.*\]=/)
      if (matches) {
        for (const match of matches) {
          const prop = (match.split(']').shift() || '').substr(1)
          console.log(
            `AMP bind syntax [${prop}]='' is not supported in JSX, use 'data-amp-bind-${prop}' instead. https://err.sh/zeit/next.js/amp-bind-jsx-alt`
          )
        }
        return
      }
    }

    return
  }

  if (state.warnings) {
    const { warnings } = state
    const newState = `warning - ${warnings.join('\n\n')}`
    if (lastState !== newState)
      console.log(`[${chalk.yellow(' warn')}]`, state.warnings.join('\n\n'))
    lastState = newState
    return
  }

  if (state.appUrl) {
    if (lastState !== 'ready')
      console.log(`[${chalk.green('ready')}] ${state.appUrl!}`)
    lastState = 'ready'
  }
})
