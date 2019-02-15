import chalk from 'chalk'
import createStore from 'unistore'

import { clearConsole } from './clearConsole'

export type OutputState =
  | { bootstrap: true; appUrl: string | null }
  | ({ bootstrap: false; appUrl: string } & (
      | { loading: true }
      | {
          loading: false
          errors: string[] | null
          warnings: string[] | null
        }))

export const store = createStore<OutputState>({ appUrl: null, bootstrap: true })

store.subscribe(state => {
  clearConsole()

  if (state.bootstrap) {
    console.log(chalk.cyan('Starting the development server ...'))
    return
  }

  if (state.loading) {
    console.log('Compiling ...')
    return
  }

  if (state.errors) {
    console.log(chalk.red('Failed to compile.'))
    console.log()
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
  console.log()
  console.log('You can now view your app in the browser.')
  console.log()
  console.log(`  > ${state.appUrl!}`)
  console.log()
  console.log('Note that pages will be compiled when you first load them.')
})
