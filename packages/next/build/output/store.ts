import chalk from 'chalk'
import createStore from 'next/dist/compiled/unistore'
import readline from 'readline'
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

process.stdout.write('\n'.repeat(process.stdout.rows || 1))
process.stdout.write('\u001b[?25l')
onExit(() => {
  process.stdout.write('\u001b[?25h')
})
store.subscribe(state => {
  if (process.stdout.isTTY) {
    readline.cursorTo(process.stdout, 0, 0)
    readline.clearScreenDown(process.stdout)
  }

  if (state.bootstrap) {
    console.log(chalk.cyan('Starting the development server ...'))
    if (state.appUrl) {
      console.log()
      console.log(`  > Waiting on ${state.appUrl!}`)
    }
    return
  }

  if (state.loading) {
    console.log('Compiling ...')
    return
  }
  
  if (state.errors) {
    console.log(chalk.red('Failed to compile.'))
    console.log()
    const cleanError = stripAnsi(state.errors[0])
    if (cleanError.indexOf('SyntaxError') > -1) {
      const matches = cleanError.match(/\[.*\]=/)
      if (matches) {
        for (const match of matches) {
          const prop = (match.split(']').shift() || '').substr(1)
          console.log(`AMP bind syntax [${prop}]='' is not supported in JSX, use 'data-amp-bind-${prop}' instead. https://err.sh/zeit/next.js/amp-bind-jsx-alt`)
        }
        console.log()
        return
      }
    }
    console.log(state.errors[0])
    return
  }

  if (state.warnings) {
    console.log(chalk.yellow('Compiled with warnings.'))
    console.log()
    console.log(state.warnings.join('\n\n'))
    return
  }

  console.log(chalk.green('Compiled successfully!'))
  if (state.appUrl) {
    console.log()
    console.log(`  > Ready on ${state.appUrl!}`)
  }
  console.log()
  console.log('Note that pages will be compiled when you first load them.')
})
