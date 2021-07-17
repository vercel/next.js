/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk'
import spawn from 'cross-spawn'

interface InstallArgs {
  /**
   * Indicate whether to install with which package manager
   */
  packageManager: 'npm' | 'yarn' | 'pnpm'
  /**
   * Indicate whether there is an active Internet connection.
   */
  isOnline: boolean
  /**
   * Indicate whether the given dependencies are devDependencies.
   */
  devDependencies?: boolean
}

/**
 * Spawn a package manager installation with either Yarn or NPM.
 *
 * @returns A Promise that resolves once the installation is finished.
 */
export function install(
  root: string,
  dependencies: string[] | null,
  { packageManager, isOnline, devDependencies }: InstallArgs
): Promise<void> {
  /**
   * NPM-specific command-line flags.
   */
  const npmFlags: string[] = []
  /**
   * Yarn-specific command-line flags.
   */
  const yarnFlags: string[] = []
  /**
   * Return a Promise that resolves once the installation is finished.
   */
  return new Promise((resolve, reject) => {
    let args: string[]
    let command: string = packageManager === 'yarn' ? 'yarnpkg' : packageManager
    const useYarn = packageManager === 'yarn'
    const usePnpm = packageManager === 'pnpm'

    if (dependencies && dependencies.length) {
      /**
       * If there are dependencies, run a variation of `{displayCommand} add`.
       */
      if (useYarn) {
        /**
         * Call `yarn add --exact (--offline)? (-D)? ...`.
         */
        args = ['add', '--exact']
        if (!isOnline) args.push('--offline')
        args.push('--cwd', root)
        if (devDependencies) args.push('--dev')
        args.push(...dependencies)
      } else if (usePnpm) {
        /**
         * Call `pnpm add --save-exact (-D)?  ...`.
         */
        args = ['add', '--save-exact']
        if (!isOnline) args.push('--offline')
        if (devDependencies) args.push('-D')
        args.push(...dependencies)
      } else {
        /**
         * Call `npm install [--save|--save-dev] ...`.
         */
        args = ['install', '--save-exact']
        args.push(devDependencies ? '--save-dev' : '--save')
        args.push(...dependencies)
      }
    } else {
      /**
       * If there are no dependencies, run a variation of `{displayCommand}
       * install`.
       */
      args = ['install']
      if (useYarn || usePnpm) {
        if (!isOnline) {
          console.log(chalk.yellow('You appear to be offline.'))
          console.log(
            chalk.yellow(`Falling back to the local ${packageManager} cache.`)
          )
          console.log()
          args.push('--offline')
        }
      } else {
        if (!isOnline) {
          console.log(chalk.yellow('You appear to be offline.'))
          console.log()
        }
      }
    }
    /**
     * Add any package manager-specific flags.
     */
    if (useYarn) {
      args.push(...yarnFlags)
    } else {
      args.push(...npmFlags)
    }
    /**
     * Spawn the installation process.
     */
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ADBLOCK: '1', DISABLE_OPENCOLLECTIVE: '1' },
    })
    child.on('close', (code) => {
      if (code !== 0) {
        reject({ command: `${command} ${args.join(' ')}` })
        return
      }
      resolve()
    })
  })
}
