#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */
import Conf from 'conf'
import prompts from 'prompts'
import updateCheck from 'update-check'
import packageJson from './package.json'
import { basename, resolve } from 'path'
import { isCI } from 'ci-info'
import { Command } from 'commander'
import { blue } from 'picocolors'
import { createApp, DownloadError } from './create-app'
import { getPkgManager, isFolderEmpty, log, validateNpmName } from './helpers'
import type { InitialReturnValue, Options, PromptType } from 'prompts'

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

const styled = (text: string) => blue(text)

const { name: pkgName, version, description } = packageJson
const program = new Command()
  .name(pkgName)
  .version(`${pkgName} v${version}`, '-v, --version')
  .description(description)
  .arguments('[directory]')
  .usage('[directory] [options]')
  .option('--ts, --typescript', 'Initialize as a TypeScript project. (default)')
  .option('--js, --javascript', 'Initialize as a JavaScript project.')
  .option('--tailwind', 'Initialize with Tailwind CSS config. (default)')
  .option('--eslint', 'Initialize with ESLint config.')
  .option('--app', 'Initialize as an App Router project.')
  .option('--src-dir', 'Initialize inside a `src/` directory.')
  .option(
    '--import-alias <alias-to-configure>',
    'Specify import alias to use (default "@/*").'
  )
  .option('--use-npm', 'Explicitly tell the CLI to bootstrap the app using npm')
  .option(
    '--use-pnpm',
    'Explicitly tell the CLI to bootstrap the app using pnpm'
  )
  .option(
    '--use-yarn',
    'Explicitly tell the CLI to bootstrap the app using Yarn'
  )
  .option('--use-bun', 'Explicitly tell the CLI to bootstrap the app using Bun')
  .option(
    '-e, --example [name]|[github-url]',
    `

  An example to bootstrap the app with. You can use an example name
  from the official Next.js repo or a public GitHub URL. The URL can use
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

const packageManager = Boolean(program.useNpm)
  ? 'npm'
  : Boolean(program.usePnpm)
  ? 'pnpm'
  : Boolean(program.useYarn)
  ? 'yarn'
  : Boolean(program.useBun)
  ? 'bun'
  : getPkgManager()

async function run(): Promise<void> {
  const conf = new Conf({ projectName: 'create-next-app' })

  if (program.resetPreferences) {
    conf.clear()
    return log.event(`Successfully reset preferences!`)
  }

  let projectPath = program.args[0]?.trim()
  if (!projectPath) {
    const response = await prompts({
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

    if (!response.path || typeof response.path !== 'string') {
      log.warn(
        '\nPlease specify the project directory:\n' +
          `  ${program.name()} '<project-directory>'\n` +
          'For example:\n' +
          `  ${program.name()} 'my-next-app'\n\n` +
          `Run ${program.name()} --help to see all options.`
      )
      process.exit(1)
    }

    projectPath = response.path.trim()
  }

  const appPath = resolve(projectPath)
  const appName = basename(appPath)

  const validation = validateNpmName(appName)
  if (!validation.valid) {
    log.error(
      `Could not create a project called "${appName}" because of npm naming restrictions:`
    )

    validation.problems.forEach((p) => log.info(`  - ${p}`))
    process.exit(1)
  }

  // Verify the project dir is empty or doesn't exist
  if (!isFolderEmpty(appPath, appName)) {
    process.exit(1)
  }

  const preferences = (conf.get('preferences') || {}) as Record<
    string,
    boolean | string
  >

  if (program.example) {
    if (typeof program.example !== 'string') {
      log.error(
        'Please provide an example name or url, otherwise remove the example option.'
      )
      process.exit(1)
    }

    const example = program.example.trim()
    return await tryCreateNextApp({ appPath, example, conf, preferences })
  }

  const defaults: typeof preferences = {
    typescript: true,
    eslint: true,
    tailwind: true,
    app: true,
    srcDir: false,
    importAlias: '@/*',
    customizeImportAlias: false,
  }

  const getPrefOrDefault = (field: string) =>
    preferences[field] ?? defaults[field]

  if (isCI) {
    if (!program.typescript && !program.javascript) {
      // default to TypeScript in CI as we can't prompt to
      // prevent breaking setup flows
      program.typescript = getPrefOrDefault('typescript')
    }

    if (
      !process.argv.includes('--eslint') &&
      !process.argv.includes('--no-eslint')
    ) {
      program.eslint = getPrefOrDefault('eslint')
    }

    if (
      !process.argv.includes('--tailwind') &&
      !process.argv.includes('--no-tailwind')
    ) {
      program.tailwind = getPrefOrDefault('tailwind')
    }

    if (
      !process.argv.includes('--src-dir') &&
      !process.argv.includes('--no-src-dir')
    ) {
      program.srcDir = getPrefOrDefault('srcDir')
    }

    if (!process.argv.includes('--app') && !process.argv.includes('--no-app')) {
      program.app = getPrefOrDefault('app')
    }

    if (
      typeof program.importAlias !== 'string' ||
      !program.importAlias.length
    ) {
      // We don't use preferences here because the default value is @/* regardless of existing preferences
      program.importAlias = defaults.importAlias
    }

    return await tryCreateNextApp({ appPath })
  }

  async function prompt(
    {
      type,
      name,
      message,
      validate,
    }: {
      type: PromptType
      name: string
      message: string
      validate?: (value: string) => boolean | string
    },
    options?: Options
  ) {
    return prompts({
      onState: onPromptState,
      type,
      name,
      message,
      initial: getPrefOrDefault(name),
      validate,
      ...(type === 'toggle' && { active: 'Yes', inactive: 'No' }),
      ...options,
    })
  }

  if (!program.typescript && !program.javascript) {
    const { typescript } = await prompt(
      {
        type: 'toggle',
        name: 'typescript',
        message: `Would you like to use ${styled('TypeScript')}?`,
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

  if (
    !process.argv.includes('--eslint') &&
    !process.argv.includes('--no-eslint')
  ) {
    const { eslint } = await prompt({
      type: 'toggle',
      name: 'eslint',
      message: `Would you like to use ${styled('ESLint')}?`,
    })
    program.eslint = Boolean(eslint)
    preferences.eslint = Boolean(eslint)
  }

  if (
    !process.argv.includes('--tailwind') &&
    !process.argv.includes('--no-tailwind')
  ) {
    const { tailwind } = await prompt({
      type: 'toggle',
      name: 'tailwind',
      message: `Would you like to use ${styled('Tailwind CSS')}?`,
    })
    program.tailwind = Boolean(tailwind)
    preferences.tailwind = Boolean(tailwind)
  }

  if (
    !process.argv.includes('--src-dir') &&
    !process.argv.includes('--no-src-dir')
  ) {
    const { srcDir } = await prompt({
      type: 'toggle',
      name: 'srcDir',
      message: `Would you like to use ${styled('`src/` directory')}?`,
    })
    program.srcDir = Boolean(srcDir)
    preferences.srcDir = Boolean(srcDir)
  }

  if (!process.argv.includes('--app') && !process.argv.includes('--no-app')) {
    const { app } = await prompt({
      type: 'toggle',
      name: 'app',
      message: `Would you like to use ${styled('App Router')}? (recommended)`,
    })
    program.app = Boolean(app)
  }

  if (typeof program.importAlias !== 'string' || !program.importAlias.length) {
    if (process.argv.includes('--no-import-alias')) {
      program.importAlias = defaults.importAlias
    } else {
      const styledImportAlias = styled('import alias')

      const { customizeImportAlias } = await prompt({
        type: 'toggle',
        name: 'customizeImportAlias',
        message: `Would you like to customize the default ${styledImportAlias} (${defaults.importAlias})?`,
      })

      if (!customizeImportAlias) {
        // We don't use preferences here because the default value is @/* regardless of existing preferences
        program.importAlias = defaults.importAlias
      } else {
        const { importAlias } = await prompt({
          type: 'text',
          name: 'importAlias',
          message: `What ${styledImportAlias} would you like configured?`,
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

  await tryCreateNextApp({ appPath, conf, preferences })
}

async function tryCreateNextApp({
  appPath,
  example,
  conf,
  preferences,
}: {
  appPath: string
  example?: string
  conf?: Conf
  preferences?: Record<string, boolean | string>
}) {
  try {
    await createApp({
      appPath,
      packageManager,
      example: example !== 'default' ? example : undefined,
      examplePath: program.examplePath,
      typescript: program.typescript,
      tailwind: program.tailwind,
      eslint: program.eslint,
      appRouter: program.app,
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
      appPath,
      packageManager,
      typescript: program.typescript,
      eslint: program.eslint,
      tailwind: program.tailwind,
      appRouter: program.app,
      srcDir: program.srcDir,
      importAlias: program.importAlias,
    })
  }

  if (conf && preferences) {
    conf.set('preferences', preferences)
  }
}

async function notifyUpdate(): Promise<void> {
  try {
    const update = await updateCheck(packageJson)
    if (update?.latest) {
      const global = {
        npm: 'npm i -g',
        yarn: 'yarn global add',
        pnpm: 'pnpm add -g',
        bun: 'bun add -g',
      }
      const updateMessage = `${global[packageManager]} create-next-app`
      log.warn(
        'A new version of `create-next-app` is available!\n' +
          `You can update by running: ${updateMessage}\n`
      )
    }
    process.exit(0)
  } catch {}
}

async function exit(reason: { command?: string }) {
  log.info('')
  log.warn('Aborting installation.')
  if (reason.command) {
    log.error(`  ${reason.command} has failed.`)
  } else {
    log.error('Unexpected error. Please report it as a bug:\n', reason)
  }
  log.info('')
  await notifyUpdate()
  process.exit(1)
}

run().then(notifyUpdate).catch(exit)
