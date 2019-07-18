import chalk from 'chalk'
import Commander from 'commander'
import path from 'path'
import prompts from 'prompts'
import updateNotifier from 'update-notifier'

import { createApp } from './create-app'
import { validateNpmName } from './helpers/validate-pkg'
import packageJson from './package.json'

let projectPath: string = ''

const program = new Commander.Command(packageJson.name)
  .version(packageJson.version)
  .arguments('<project-directory>')
  .usage(`${chalk.green('<project-directory>')} [options]`)
  .action(name => {
    projectPath = name
  })
  .option('--use-npm')
  .option(
    '-e, --example <example-path>',
    'an example to bootstrap the app with'
  )
  .allowUnknownOption()
  .parse(process.argv)

async function run() {
  if (typeof projectPath === 'string') {
    projectPath = projectPath.trim()
  }

  if (!projectPath) {
    const res = await prompts({
      type: 'text',
      name: 'path',
      message: 'What is your project named?',
      initial: 'my-app',
      validate: name => {
        const validation = validateNpmName(path.basename(path.resolve(name)))
        if (validation.valid) {
          return true
        }
        return 'Invalid project name: ' + validation.problems![0]
      },
    })

    if (typeof res.path === 'string') {
      projectPath = res.path.trim()
    }
  }

  if (!projectPath) {
    console.log()
    console.log('Please specify the project directory:')
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}`
    )
    console.log()
    console.log('For example:')
    console.log(`  ${chalk.cyan(program.name())} ${chalk.green('my-next-app')}`)
    console.log()
    console.log(
      `Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`
    )
    process.exit(1)
  }

  const resolvedProjectPath = path.resolve(projectPath)
  const projectName = path.basename(resolvedProjectPath)

  const { valid, problems } = validateNpmName(projectName)
  if (!valid) {
    console.error(
      `Could not create a project called ${chalk.red(
        `"${projectName}"`
      )} because of npm naming restrictions:`
    )

    problems!.forEach(p => console.error(`    ${chalk.red.bold('*')} ${p}`))
    process.exit(1)
  }

  await createApp({
    appPath: resolvedProjectPath,
    useNpm: !!program.useNpm,
    example:
      typeof program.example === 'string' && program.example.trim()
        ? program.example.trim()
        : undefined,
  })
}

const notifier = updateNotifier({ pkg: packageJson })
run()
  .then(() => {
    notifier.notify()
  })
  .catch(reason => {
    console.log()
    console.log('Aborting installation.')
    if (reason.command) {
      console.log(`  ${chalk.cyan(reason.command)} has failed.`)
    } else {
      console.log(chalk.red('Unexpected error. Please report it as a bug:'))
      console.log(reason)
    }
    console.log()

    notifier.notify()

    process.exit(1)
  })
