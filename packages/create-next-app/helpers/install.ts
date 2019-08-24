import chalk from 'chalk'
import spawn from 'cross-spawn'

export function install(
  root: string,
  dependencies: string[] | null,
  { useYarn, isOnline }: { useYarn: boolean; isOnline: boolean }
) {
  return new Promise((resolve, reject) => {
    let command: string
    let args: string[]
    if (useYarn) {
      command = 'yarnpkg'
      args = dependencies ? ['add', '--exact'] : ['install']
      if (!isOnline) {
        args.push('--offline')
      }
      if (dependencies) {
        args.push(...dependencies)
      }
      args.push('--cwd', root)

      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'))
        console.log(chalk.yellow('Falling back to the local Yarn cache.'))
        console.log()
      }
    } else {
      command = 'npm'
      args = ([
        'install',
        dependencies && '--save',
        dependencies && '--save-exact',
        '--loglevel',
        'error',
      ].filter(Boolean) as string[]).concat(dependencies || [])
    }

    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ADBLOCK: '1', DISABLE_OPENCOLLECTIVE: '1' },
    })
    child.on('close', code => {
      if (code !== 0) {
        reject({ command: `${command} ${args.join(' ')}` })
        return
      }
      resolve()
    })
  })
}
