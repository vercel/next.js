#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk'
import Commander from 'commander'
import Conf from 'conf'
import path from 'path'
import prompts from 'prompts'
import checkForUpdate from 'update-check'
import { createApp, DownloadError } from './create-app'
import { getPkgManager } from './helpers/get-pkg-manager'
import { validateNpmName } from './helpers/validate-pkg'
import packageJson from './package.json'
import ciInfo from 'ci-info'
import { isFolderEmpty } from './helpers/is-folder-empty'
import fs from 'fs'

let projectPath: string = ''

const handleSigTerm = () => process.exit(0)

process.on('SIGINT', handleSigTerm)
process.on('SIGTERM', handleSigTerm)

const onPromptState = (state: any) => {
  if (state.aborted) {
    // If we don't re-enable the terminal cursor before exiting
    // the program, the cursor will remain hidden
    process.stdout.write('\x1B[?25h')
    process.stdout.write('\n')
    process.exit(1)
  }
}

const program = new Commander.Command(packageJson.name)
  .version(packageJson.version)
  .arguments('<project-directory>')
  .usage(`${chalk.green('<project-directory>')} [options]`)
  .action((name) => {
    projectPath = name
  })
  .option(
    '--ts, --typescript',
    `

  Initialize as a TypeScript project. (default)
`
  )
  .option(
    '--js, --javascript',
    `

  Initialize as a JavaScript project.
`
  )
  .option(
    '--eslint',
    `

  Initialize with eslint config.
`
  )
  .option(
    '--experimental-app',
    `

  Initialize as a \`app/\` directory project.
`
  )
  .option(
    '--src-dir',
    `

  Initialize inside a \`src/\` directory.
`
  )
  .option(
    '--import-alias <alias-to-configure>',
    `

  Specify import alias to use (default "@/*").
`
  )
  .option(
    '--use-npm',
    `

  Explicitly tell the CLI to bootstrap the app using npm
`
  )
  .option(
    '--use-pnpm',
    `

  Explicitly tell the CLI to bootstrap the app using pnpm
`
  )
  .option(
    '-e, --example [name]|[github-url]',
    `

  An example to bootstrap the app with. You can use an example name
  from the official Next.js repo or a GitHub URL. The URL can use
  any branch and/or subdirectory
`
  )
  .option(
    '--example-path <path-to-example>',
    `

  In a rare case, your GitHub URL might contain a branch name with
  a slash (e.g. bug/fix-1) and the path to the example (e.g. foo/bar).
  In this case, you must specify the path to the example separately:
  --example-path foo/bar
`
  )
  .option(
    '--reset-preferences',
    `

  Explicitly tell the CLI to reset any stored preferences
`
  )
  .allowUnknownOption()
  .parse(process.argv)

const packageManager = !!program.useNpm
  ? 'npm'
  : !!program.usePnpm
  ? 'pnpm'
  : getPkgManager()

async function run(): Promise<void> {
  const conf = new Conf({ projectName: 'create-next-app' })

  if (program.resetPreferences) {
    conf.clear()
    console.log(`Preferences reset successfully`)
    return
  }

  if (typeof projectPath === 'string') {
    projectPath = projectPath.trim()
  }

  if (!projectPath) {
    const res = await prompts({
      onState: onPromptState,
      type: 'text',
      name: 'path',
      message: 'What is your project named?',
      initial: 'my-app',
      validate: (name) => {
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
    console.log(
      '\nPlease specify the project directory:\n' +
        `  ${chalk.cyan(program.name())} ${chalk.green(
          '<project-directory>'
        )}\n` +
        'For example:\n' +
        `  ${chalk.cyan(program.name())} ${chalk.green('my-next-app')}\n\n` +
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

    problems!.forEach((p) => console.error(`    ${chalk.red.bold('*')} ${p}`))
    process.exit(1)
  }

  if (program.example === true) {
    console.error(
      'Please provide an example name or url, otherwise remove the example option.'
    )
    process.exit(1)
  }

  /**
   * Verify the project dir is empty or doesn't exist
   */
  const root = path.resolve(resolvedProjectPath)
  const appName = path.basename(root)
  const folderExists = fs.existsSync(root)

  if (folderExists && !isFolderEmpty(root, appName)) {
    process.exit(1)
  }

  const example = typeof program.example === 'string' && program.example.trim()
  const preferences = (conf.get('preferences') || {}) as Record<
    string,
    boolean | string
  >
  /**
   * If the user does not provide the necessary flags, prompt them for whether
   * to use TS or JS.
   */
  if (!example) {
    const defaults: typeof preferences = {
      typescript: true,
      eslint: true,
      srcDir: false,
      importAlias: '@/*',
    }
    const getPrefOrDefault = (field: string) => {
      return typeof preferences[field] === 'undefined'
        ? defaults[field]
        : preferences[field]
    }

    if (!program.typescript && !program.javascript) {
      if (ciInfo.isCI) {
        // default to JavaScript in CI as we can't prompt to
        // prevent breaking setup flows
        program.typescript = false
        program.javascript = true
      } else {
        const styledTypeScript = chalk.hex('#007acc')('TypeScript')
        const { typescript } = await prompts(
          {
            type: 'toggle',
            name: 'typescript',
            message: `Would you like to use ${styledTypeScript} with this project?`,
            initial: getPrefOrDefault('typescript'),
            active: 'Yes',
            inactive: 'No',
          },
          {
            /**
             * User inputs Ctrl+C or Ctrl+D to exit the prompt. We should close the
             * process and not write to the file system.
             */
            onCancel: () => {
              console.error('Exiting.')
              process.exit(1)
            },
          }
        )
        /**
         * Depending on the prompt response, set the appropriate program flags.
         */
        program.typescript = Boolean(typescript)
        program.javascript = !Boolean(typescript)
        preferences.typescript = Boolean(typescript)
      }
    }

    if (
      !process.argv.includes('--eslint') &&
      !process.argv.includes('--no-eslint')
    ) {
      if (ciInfo.isCI) {
        program.eslint = true
      } else {
        const styledEslint = chalk.hex('#007acc')('ESLint')
        const { eslint } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'eslint',
          message: `Would you like to use ${styledEslint} with this project?`,
          initial: getPrefOrDefault('eslint'),
          active: 'Yes',
          inactive: 'No',
        })
        program.eslint = Boolean(eslint)
        preferences.eslint = Boolean(eslint)
      }
    }

    if (
      !process.argv.includes('--src-dir') &&
      !process.argv.includes('--no-src-dir')
    ) {
      if (ciInfo.isCI) {
        program.srcDir = false
      } else {
        const styledSrcDir = chalk.hex('#007acc')('`src/` directory')
        const { srcDir } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'srcDir',
          message: `Would you like to use ${styledSrcDir} with this project?`,
          initial: getPrefOrDefault('srcDir'),
          active: 'Yes',
          inactive: 'No',
        })
        program.srcDir = Boolean(srcDir)
        preferences.srcDir = Boolean(srcDir)
      }
    }

    if (
      !process.argv.includes('--experimental-app') &&
      !process.argv.includes('--no-experimental-app')
    ) {
      if (ciInfo.isCI) {
        program.experimentalApp = false
      } else {
        const styledAppDir = chalk.hex('#007acc')(
          'experimental `app/` directory'
        )
        const { appDir } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'appDir',
          message: `Would you like to use ${styledAppDir} with this project?`,
          initial: false,
          active: 'Yes',
          inactive: 'No',
        })
        program.experimentalApp = Boolean(appDir)
      }
    }

    if (
      typeof program.importAlias !== 'string' ||
      !program.importAlias.length
    ) {
      if (ciInfo.isCI) {
        program.importAlias = '@/*'
      } else {
        const styledImportAlias = chalk.hex('#007acc')('import alias')
        const { importAlias } = await prompts({
          onState: onPromptState,
          type: 'text',
          name: 'importAlias',
          message: `What ${styledImportAlias} would you like configured?`,
          initial: getPrefOrDefault('importAlias'),
          validate: (value) =>
            /.+\/\*/.test(value)
              ? true
              : 'Import alias must follow the pattern <prefix>/*',
        })
        program.importAlias = importAlias
        preferences.importAlias = importAlias
      }
    }
  }

  try {
    await createApp({
      appPath: resolvedProjectPath,
      packageManager,
      example: example && example !== 'default' ? example : undefined,
      examplePath: program.examplePath,
      typescript: program.typescript,
      eslint: program.eslint,
      experimentalApp: program.experimentalApp,
      srcDir: program.srcDir,
      importAlias: program.importAlias,
    })
  } catch (reason) {
    if (!(reason instanceof DownloadError)) {
      throw reason
    }

    const res = await prompts({
      onState: onPromptState,
      type: 'confirm',
      name: 'builtin',
      message:
        `Could not download "${example}" because of a connectivity issue between your machine and GitHub.\n` +
        `Do you want to use the default template instead?`,
      initial: true,
    })
    if (!res.builtin) {
      throw reason
    }

    await createApp({
      appPath: resolvedProjectPath,
      packageManager,
      typescript: program.typescript,
      eslint: program.eslint,
      experimentalApp: program.experimentalApp,
      srcDir: program.srcDir,
      importAlias: program.importAlias,
    })
  }
  conf.set('preferences', preferences)
}

const update = checkForUpdate(packageJson).catch(() => null)

async function notifyUpdate(): Promise<void> {
  try {
    const res = await update
    if (res?.latest) {
      const updateMessage =
        packageManager === 'yarn'
          ? 'yarn global add create-next-app'
          : packageManager === 'pnpm'
          ? 'pnpm add -g create-next-app'
          : 'npm i -g create-next-app'

      console.log(
        chalk.yellow.bold('A new version of `create-next-app` is available!') +
          '\n' +
          'You can update by running: ' +
          chalk.cyan(updateMessage) +
          '\n'
      )
    }
    process.exit()
  } catch {
    // ignore error
  }
}

run()
  .then(notifyUpdate)
  .catch(async (reason) => {
    console.log()
    console.log('Aborting installation.')
    if (reason.command) {
      console.log(`  ${chalk.cyan(reason.command)} has failed.`)
    } else {
      console.log(
        chalk.red('Unexpected error. Please report it as a bug:') + '\n',
        reason
      )
    }
    console.log()

    await notifyUpdate()

    process.exit(1)
  })
