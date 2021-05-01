/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk'
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

export function install(
  root: string,
  dependencies: string[] | null,
  { useYarn, isOnline, devDependencies }: InstallArgs
): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string
    let args: string[] = []
    if (useYarn) {
      /**
       * Installing with Yarn.
       */
      command = 'yarnpkg'
      if (dependencies && dependencies.length) {
        args = ['add', '--exact']
        if (!isOnline) args.push('--offline')
        if (devDependencies) args.push('-D')
        args.push(...dependencies)
        args.push('--cwd', root)
      } else {
        /**
         * Run `yarn install` if no deps.
         */
        args = ['install']
      }
      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'))
        console.log(chalk.yellow('Falling back to the local Yarn cache.'))
        console.log()
      }
    } else {
      /**
       * Installing with NPM.
       */
      command = 'npm'
      const npmFlags = ['--logLevel', 'error']
      if (dependencies && dependencies.length) {
        args = ['install', '--save-exact']
        args.push(devDependencies ? '--save-dev' : '--save')
        args.push(...dependencies)
      } else {
        /**
         * Run `npm install` if no deps.
         */
        args = ['install']
      }
      args.push(...npmFlags)
    }

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
