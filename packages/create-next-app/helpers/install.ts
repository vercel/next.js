/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk'
import spawn from 'cross-spawn'

interface InstallArgs {
  useYarn: boolean
  isOnline: boolean
  devDependencies?: string[]
}

export function install(
  root: string,
  dependencies: string[] | null,
  { useYarn, isOnline, devDependencies }: InstallArgs
): Promise<void> {
  return new Promise((resolve, reject) => {
    const depsExist = dependencies && dependencies.length
    const devDepsExist = devDependencies && devDependencies.length

    let command: string
    let args: string[] = []
    if (useYarn) {
      command = 'yarnpkg'

      if (!depsExist && !devDepsExist) {
        args = ['install']
      } else {
        args = ['add', '--exact']
        if (!isOnline) {
          args.push('--offline')
        }
        if (depsExist) {
          if (dependencies) {
            args.push(...dependencies)
          }
        } else if (devDepsExist) {
          args.push('-D')
          if (devDependencies) {
            args.push(...devDependencies)
          }
        }
        args.push('--cwd', root)
      }

      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'))
        console.log(chalk.yellow('Falling back to the local Yarn cache.'))
        console.log()
      }
    } else {
      command = 'npm'
      const npmFlags = ['--logLevel', 'error']
      if (depsExist) {
        args = (['install', '--save', '--save-exact'].filter(
          Boolean
        ) as string[]).concat(dependencies || [])
      } else if (devDepsExist) {
        args = (['install', '--save-dev', '--save-exact'].filter(
          Boolean
        ) as string[]).concat(dependencies || [])
      } else {
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
