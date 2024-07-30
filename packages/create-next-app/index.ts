#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */
import type { InitialReturnValue } from 'prompts'
import type { PackageManager } from './helpers/get-pkg-manager'
import Conf from 'conf'
import ciInfo from 'ci-info'
import prompts from 'prompts'
import updateCheck from 'update-check'
import packageJson from './package.json'
import { basename, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { Command } from 'commander'
import { cyan, green, red, yellow, bold, blue } from 'picocolors'
import { createApp, DownloadError } from './create-app'
import { getPkgManager } from './helpers/get-pkg-manager'
import { isFolderEmpty } from './helpers/is-folder-empty'
import { validateNpmName } from './helpers/validate-pkg'

let appName: string = ''

const handleSigTerm = () => process.exit(0)

process.on('SIGINT', handleSigTerm)
process.on('SIGTERM', handleSigTerm)

const onPromptState = (state: {
  value: InitialReturnValue
  aborted: boolean
  exited: boolean
}) => {
  if (state.aborted) {
    // If we don't re-enable the terminal cursor before exiting
    // the program, the cursor will remain hidden
    process.stdout.write('\x1B[?25h')
    process.stdout.write('\n')
    process.exit(1)
  }
}

const program = new Command(packageJson.name)
  .version(
    packageJson.version,
    '-v, --version',
    'Output the current version of create-next-app.'
  )
  .argument('[directory]')
  .usage('[directory] [options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option('--ts, --typescript', 'Initialize as a TypeScript project. (default)')
  .option('--js, --javascript', 'Initialize as a JavaScript project.')
  .option('--tailwind', 'Initialize with Tailwind CSS config. (default)')
  .option('--eslint', 'Initialize with ESLint config.')
  .option('--app', 'Initialize as an App Router project.')
  .option('--src-dir', "Initialize inside a 'src/' directory.")
  .option('--turbo', 'Enable Turbopack by default for development.')
  .option(
    '--import-alias <prefix/*>',
    'Specify import alias to use (default "@/*").'
  )
  .option('--empty', 'Initialize an empty project.')
  .option(
    '--use-npm',
    'Explicitly tell the CLI to bootstrap the application using npm.'
  )
  .option(
    '--use-pnpm',
    'Explicitly tell the CLI to bootstrap the application using pnpm.'
  )
  .option(
    '--use-yarn',
    'Explicitly tell the CLI to bootstrap the application using Yarn.'
  )
  .option(
    '--use-bun',
    'Explicitly tell the CLI to bootstrap the application using Bun.'
  )
  .option(
    '--reset, --reset-preferences',
    'Reset the preferences saved for create-next-app.'
  )
  .option(
    '--skip-install',
    'Explicitly tell the CLI to skip installing packages.'
  )
  .option('--yes', 'Use saved preferences or defaults for unprovided options.')
  .option(
    '-e, --example <example-name|github-url>',
    `

  An example to bootstrap the app with. You can use an example name
  from the official Next.js repo or a public GitHub URL. The URL can use
  any branch and/or subdirectory.
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
  .action((name) => {
    // Commander does not implicitly support negated options. When they are used
    // by the user they will be interpreted as the positional argument (name) in
    // the action handler. See https://github.com/tj/commander.js/pull/1355
    if (name && !name.startsWith('--no-')) {
      appName = name.trim()
    }
  })
  .allowUnknownOption()
  .parse(process.argv)

const opts = program.opts()
// const { args } = program

const packageManager: PackageManager = !!opts.useNpm
  ? 'npm'
  : !!opts.usePnpm
    ? 'pnpm'
    : !!opts.useYarn
      ? 'yarn'
      : !!opts.useBun
        ? 'bun'
        : getPkgManager()

const conf = new Conf({ projectName: 'create-next-app' })

const preferences = (conf.get('preferences') ?? {}) as {
  [key: string]: string | boolean
}

const defaults = {
  typescript: true,
  eslint: true,
  tailwind: true,
  app: true,
  srcDir: false,
  importAlias: '@/*',
  skipInstall: false,
  customizeImportAlias: false,
  empty: false,
  turbo: false,
}

const getPrefOrDefault = (field: keyof typeof defaults) =>
  preferences[field] ?? defaults[field]

async function run(): Promise<void> {
  if (opts.resetPreferences) {
    const { resetPreferences } = await prompts({
      onState: onPromptState,
      type: 'toggle',
      name: 'resetPreferences',
      message: 'Would you like to reset the saved preferences?',
      initial: false,
      active: 'Yes',
      inactive: 'No',
    })
    if (resetPreferences) {
      conf.clear()
      console.log('The preferences have been reset successfully!')
    }
    process.exit(0)
  }

  const isDryRun = args.includes('--dry-run')
  if (isDryRun) {
    console.log('Running a dry run, skipping installation.')
  }

  if (!appName) {
    const { path } = await prompts({
      onState: onPromptState,
      type: 'text',
      name: 'path',
      message: 'What is your project named?',
      initial: 'my-app',
      validate: (name) => {
        const validation = validateNpmName(basename(resolve(name)))
        if (validation.valid) {
          return true
        }
        return 'Invalid project name: ' + validation.problems[0]
      },
    })

    if (typeof path === 'string') {
      appName = path.trim()
    }

    if (!appName) {
      console.log(
        '\nPlease specify the project directory:\n' +
          `  ${cyan(opts.name())} ${green('<project-directory>')}\n` +
          'For example:\n' +
          `  ${cyan(opts.name())} ${green('my-next-app')}\n\n` +
          `Run ${cyan(`${opts.name()} --help`)} to see all options.`
      )
      process.exit(1)
    }
  }

  const validation = validateNpmName(appName)
  if (!validation.valid) {
    console.error(
      `Could not create a project called ${red(
        `"${appName}"`
      )} because of npm naming restrictions:`
    )

    validation.problems.forEach((p) =>
      console.error(`    ${red(bold('*'))} ${p}`)
    )
    process.exit(1)
  }

  const appPath = resolve(appName)
  if (existsSync(appPath) && !isFolderEmpty(appPath, appName)) {
    process.exit(1)
  }

  if (opts.example === true) {
    console.error(
      'Please provide an example name or url, otherwise remove the example option.'
    )
    process.exit(1)
  }

  const example = typeof opts.example === 'string' && opts.example.trim()

  /**
   * If the user does not provide the necessary flags, prompt them for their
   * preferences, unless `--yes` option was specified, or when running in CI.
   */
  const skipPrompt = ciInfo.isCI || opts.yes

  if (!example) {
    if (!opts.typescript && !opts.javascript) {
      if (skipPrompt) {
        // default to TypeScript in CI as we can't prompt to
        // prevent breaking setup flows
        opts.typescript = getPrefOrDefault('typescript')
      } else {
        const styledTypeScript = blue('TypeScript')
        const { typescript } = await prompts(
          {
            type: 'toggle',
            name: 'typescript',
            message: `Would you like to use ${styledTypeScript}?`,
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
        opts.typescript = Boolean(typescript)
        opts.javascript = !Boolean(typescript)
        preferences.typescript = Boolean(typescript)
      }
    }

    if (!opts.eslint && !args.includes('--no-eslint')) {
      if (skipPrompt) {
        opts.eslint = getPrefOrDefault('eslint')
      } else {
        const styledEslint = blue('ESLint')
        const { eslint } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'eslint',
          message: `Would you like to use ${styledEslint}?`,
          initial: getPrefOrDefault('eslint'),
          active: 'Yes',
          inactive: 'No',
        })
        opts.eslint = Boolean(eslint)
        preferences.eslint = Boolean(eslint)
      }
    }

    if (!opts.tailwind && !args.includes('--no-tailwind')) {
      if (skipPrompt) {
        opts.tailwind = getPrefOrDefault('tailwind')
      } else {
        const tw = blue('Tailwind CSS')
        const { tailwind } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'tailwind',
          message: `Would you like to use ${tw}?`,
          initial: getPrefOrDefault('tailwind'),
          active: 'Yes',
          inactive: 'No',
        })
        opts.tailwind = Boolean(tailwind)
        preferences.tailwind = Boolean(tailwind)
      }
    }

    if (!opts.srcDir && !args.includes('--no-src-dir')) {
      if (skipPrompt) {
        opts.srcDir = getPrefOrDefault('srcDir')
      } else {
        const styledSrcDir = blue('`src/` directory')
        const { srcDir } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'srcDir',
          message: `Would you like your code inside a ${styledSrcDir}?`,
          initial: getPrefOrDefault('srcDir'),
          active: 'Yes',
          inactive: 'No',
        })
        opts.srcDir = Boolean(srcDir)
        preferences.srcDir = Boolean(srcDir)
      }
    }

    if (!opts.app && !args.includes('--no-app')) {
      if (skipPrompt) {
        opts.app = getPrefOrDefault('app')
      } else {
        const styledAppDir = blue('App Router')
        const { app } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'app',
          message: `Would you like to use ${styledAppDir}? (recommended)`,
          initial: getPrefOrDefault('app'),
          active: 'Yes',
          inactive: 'No',
        })
        opts.app = Boolean(app)
        preferences.app = Boolean(app)
      }
    }

    if (!opts.turbo && !args.includes('--no-turbo')) {
      if (skipPrompt) {
        opts.turbo = getPrefOrDefault('turbo')
      } else {
        const styledTurbo = blue('Turbopack')
        const { turbo } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'turbo',
          message: `Would you like to use ${styledTurbo} for ${`next dev`}?`,
          initial: getPrefOrDefault('turbo'),
          active: 'Yes',
          inactive: 'No',
        })
        opts.turbo = Boolean(turbo)
        preferences.turbo = Boolean(turbo)
      }
    }

    const importAliasPattern = /^[^*"]+\/\*\s*$/
    if (
      typeof opts.importAlias !== 'string' ||
      !importAliasPattern.test(opts.importAlias)
    ) {
      if (skipPrompt) {
        // We don't use preferences here because the default value is @/* regardless of existing preferences
        opts.importAlias = defaults.importAlias
      } else if (args.includes('--no-import-alias')) {
        opts.importAlias = defaults.importAlias
      } else {
        const styledImportAlias = blue('import alias')

        const { customizeImportAlias } = await prompts({
          onState: onPromptState,
          type: 'toggle',
          name: 'customizeImportAlias',
          message: `Would you like to customize the ${styledImportAlias} (${defaults.importAlias} by default)?`,
          initial: getPrefOrDefault('customizeImportAlias'),
          active: 'Yes',
          inactive: 'No',
        })

        if (!customizeImportAlias) {
          // We don't use preferences here because the default value is @/* regardless of existing preferences
          opts.importAlias = defaults.importAlias
        } else {
          const { importAlias } = await prompts({
            onState: onPromptState,
            type: 'text',
            name: 'importAlias',
            message: `What ${styledImportAlias} would you like configured?`,
            initial: getPrefOrDefault('importAlias'),
            validate: (value) =>
              importAliasPattern.test(value)
                ? true
                : 'Import alias must follow the pattern <prefix>/*',
          })
          opts.importAlias = importAlias
          preferences.importAlias = importAlias
        }
      }
    }
  }

  const createAppParams = {
    appPath,
    packageManager,
    // Proceed to default app if the example value is "default".
    // x-ref: https://github.com/vercel/next.js/pull/12109
    example: example && example !== 'default' ? example : undefined,
    examplePath: opts.examplePath,
    typescript: opts.typescript,
    tailwind: opts.tailwind,
    eslint: opts.eslint,
    app: opts.app,
    srcDir: opts.srcDir,
    importAlias: opts.importAlias,
    skipInstall: opts.skipInstall,
    empty: opts.empty,
    turbo: opts.turbo,
  }

  if (isDryRun) {
    console.log('Dry Run Result:')
    console.log(JSON.stringify(createAppParams, null, 2))
    return
  }

  try {
    await createApp(createAppParams)
  } catch (reason) {
    if (!(reason instanceof DownloadError)) {
      throw reason
    }

    const { builtin } = await prompts({
      onState: onPromptState,
      type: 'confirm',
      name: 'builtin',
      message:
        `Could not download "${example}" because of a connectivity issue between your machine and GitHub.\n` +
        `Do you want to use the default template instead?`,
      initial: true,
    })

    if (!builtin) {
      throw reason
    }

    await createApp({
      appPath,
      packageManager,
      typescript: opts.typescript,
      eslint: opts.eslint,
      tailwind: opts.tailwind,
      app: opts.app,
      srcDir: opts.srcDir,
      importAlias: opts.importAlias,
      skipInstall: opts.skipInstall,
      empty: opts.empty,
      turbo: opts.turbo,
    })
  }
  conf.set('preferences', preferences)
}

const global = {
  npm: 'npm i -g',
  yarn: 'yarn global add',
  pnpm: 'pnpm add -g',
  bun: 'bun add -g',
}
const updateMessage = `${global[packageManager]} create-next-app`
const update = updateCheck(packageJson).catch(() => null)

async function notifyUpdate(): Promise<void> {
  try {
    if ((await update)?.latest) {
      console.log(
        yellow(bold('A new version of `create-next-app` is available!')) +
          '\n' +
          'You can update by running: ' +
          cyan(updateMessage) +
          '\n'
      )
    }
    process.exit(0)
  } catch {
    // ignore error
  }
}

async function exit(reason: { command?: string }) {
  console.log()
  console.log('Aborting installation.')
  if (reason.command) {
    console.log(`  ${cyan(reason.command)} has failed.`)
  } else {
    console.log(
      red('Unexpected error. Please report it as a bug:') + '\n',
      reason
    )
  }
  console.log()
  await notifyUpdate()
  process.exit(1)
}

run().then(notifyUpdate).catch(exit)
