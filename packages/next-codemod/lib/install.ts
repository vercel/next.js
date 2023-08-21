/* eslint-disable import/no-extraneous-dependencies */
import { yellow } from 'picocolors'
import spawn from 'cross-spawn'

interface InstallArgs {
  /**
   * Indicate whether to install packages using Yarn.
   */
  useYarn: boolean
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
  { useYarn, isOnline, devDependencies }: InstallArgs
): Promise<void> {
  /**
   * NPM-specific command-line flags.
   */
  const npmFlags: string[] = ['--logLevel', 'error']
  /**
   * Yarn-specific command-line flags.
   */
  const yarnFlags: string[] = []
  /**
   * Return a Promise that resolves once the installation is finished.
   */
  return new Promise((resolve, reject) => {
    let args: string[]
    let command: string = useYarn ? 'yarnpkg' : 'npm'

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
      if (!isOnline) {
        console.log(yellow('You appear to be offline.'))
        if (useYarn) {
          console.log(yellow('Falling back to the local Yarn cache.'))
          console.log()
          args.push('--offline')
        } else {
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
