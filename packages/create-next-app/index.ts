#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */
import Conf from 'conf'
import prompts from 'prompts'
import updateCheck from 'update-check'
import packageJson from './package.json'
import { existsSync } from 'fs'
import { basename, resolve } from 'path'
import { isCI } from 'ci-info'
import { Command, Option } from 'commander'
import {
  blue,
  bold,
  italic,
  gray,
  green,
  magenta,
  red,
  reset,
  yellow,
} from 'picocolors'
import { createApp, DownloadError } from './create-app'
import { getPkgManager, isFolderEmpty, log, validateNpmName } from './helpers'
import type { InitialReturnValue, Options, PromptType } from 'prompts'
import type {
  CreateNextAppOptions,
  PackageManager,
  ResolvedCreateNextAppOptions,
} from './types'

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

/**
 * Colored Texts
 */
const ct = {
  app: red('App Router'),
  cna: packageJson.name,
  default: gray('(default)'),
  eslint: magenta('ESLint'),
  importAlias: bold(italic('import alias')),
  javascript: yellow('JavaScript'),
  srcDir: bold('"src/"'),
  tailwind: green('Tailwind CSS'),
  typescript: blue('TypeScript'),
}

const program = new Command()
  .name(ct.cna)
  .version(
    `${ct.cna} v${packageJson.version}`,
    '-v, --version',
    `Output the current version of ${ct.cna}.`
  )
  .arguments('[directory]')
  .usage('[directory] [options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option('--app', `Initialize as an ${ct.app} project. ${ct.default}`)
  .option(
    '--ts, --typescript',
    `Initialize as a ${ct.typescript} project. ${ct.default}`
  )
  .option('--js, --javascript', `Initialize as a ${ct.javascript} project.`)
  .option('--eslint', `Enable ${ct.eslint} config. ${ct.default}`)
  .option('--tailwind', `Enable ${ct.tailwind} config. ${ct.default}`)
  .option('--src-dir', `Initialize inside a ${ct.srcDir} directory.`)
  .option(
    '--import-alias <prefix/*>',
    `Specify ${ct.importAlias} to use. ${gray('(default: "@/*")')}`
  )
  .addOption(
    new Option(
      '--use <package-manager>',
      `Specify the package manager to use.`
    ).choices(['npm', 'pnpm', 'yarn', 'bun'])
  )
  .option(
    '--reset, --reset-preferences',
    `Reset the preferences saved for ${ct.cna}.`
  )
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
  .allowUnknownOption()
  .configureOutput({
    outputError: (str, write) => write(`${red(bold('⨯'))} ${str}`),
  })
  .parse(process.argv)

const opts: CreateNextAppOptions = program.opts()
const { args } = program

const packageManager: PackageManager = opts.use
  ? opts.use
  : args.includes('--use-npm')
  ? 'npm'
  : args.includes('--use-pnpm')
  ? 'pnpm'
  : args.includes('--use-yarn')
  ? 'yarn'
  : args.includes('--use-bun')
  ? 'bun'
  : getPkgManager()

const defaults = {
  typescript: true,
  eslint: true,
  tailwind: true,
  app: true,
  srcDir: false,
  importAlias: '@/*',
  customizeImportAlias: false,
}

async function run(): Promise<void> {
  const conf = new Conf({ projectName: 'create-next-app' })

  if (opts.resetPreferences) {
    const { resetPreferences } = await prompts({
      onState: onPromptState,
      type: 'toggle',
      name: 'resetPreferences',
      message: reset('Would you like to reset the saved preferences?'),
      initial: false,
      active: 'Yes',
      inactive: 'No',
    })
    if (resetPreferences) {
      conf.clear()
      return log.event('The preferences have been reset successfully!')
    }
    process.exit(0)
  }

  const isDryRun = args.includes('--dry-run')
  if (isDryRun) {
    log.ready('Running a dry run, skipping installation.')
  }

  let projectPath = args[0]?.trim()
  if (!projectPath || projectPath.startsWith('-')) {
    const response = await prompts({
      onState: onPromptState,
      type: 'text',
      name: 'path',
      message: reset('What is your project named?'),
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
  if (existsSync(appPath) && !isFolderEmpty(appPath, appName)) {
    process.exit(1)
  }

  if (opts.example) {
    const resolvedOpts: ResolvedCreateNextAppOptions = {
      typescript: Boolean(opts.typescript),
      eslint: Boolean(opts.eslint),
      tailwind: Boolean(opts.tailwind),
      app: Boolean(opts.app),
      srcDir: Boolean(opts.srcDir),
      importAlias: opts.importAlias ?? defaults.importAlias,
    }
    await tryCreateNextApp({
      appPath,
      resolvedOpts,
      example: opts.example.trim(),
      isDryRun,
    })
    return
  }

  const preferences = (conf.get('preferences') ?? {}) as typeof defaults
  const getPrefOrDefault = <T extends keyof typeof defaults>(field: T) =>
    preferences[field] ?? defaults[field]

  // We set the missing options to their defaults in CI to skip the prompts.
  if (isCI) {
    if (!opts.typescript && !opts.javascript) {
      opts.typescript = getPrefOrDefault('typescript')
    }
    if (!opts.eslint && !args.includes('--no-eslint')) {
      opts.eslint = getPrefOrDefault('eslint')
    }
    if (!opts.tailwind && !args.includes('--no-tailwind')) {
      opts.tailwind = getPrefOrDefault('tailwind')
    }
    if (!opts.srcDir && !args.includes('--no-src-dir')) {
      opts.srcDir = getPrefOrDefault('srcDir')
    }
    if (!opts.app && !args.includes('--no-app')) {
      opts.app = getPrefOrDefault('app')
    }
    if (!opts.importAlias) {
      opts.importAlias = defaults.importAlias
    }

    const resolvedOpts: ResolvedCreateNextAppOptions = {
      typescript: Boolean(opts.typescript),
      eslint: Boolean(opts.eslint),
      tailwind: Boolean(opts.tailwind),
      app: Boolean(opts.app),
      srcDir: Boolean(opts.srcDir),
      importAlias: opts.importAlias,
    }
    await tryCreateNextApp({
      appPath,
      resolvedOpts,
    })
    return
  }

  function _prompt(
    {
      type,
      name,
      message,
      validate,
    }: {
      type: PromptType
      name: keyof typeof defaults
      message: string
      validate?: (value: string) => boolean | string
    },
    options?: Options
  ): Promise<{
    [key in typeof name]: key extends 'importAlias' ? string : boolean
  }> {
    return prompts({
      onState: onPromptState,
      type,
      name,
      message: () => reset(message),
      initial: getPrefOrDefault(name),
      validate,
      ...(type === 'toggle' && { active: 'Yes', inactive: 'No' }),
      ...options,
    })
  }

  if (!opts.app && !args.includes('--no-app')) {
    const { app } = await _prompt({
      type: 'toggle',
      name: 'app',
      message: `Would you like to use ${ct.app}? (recommended)`,
    })
    // don't save the app pref since we recommend it.
    opts.app = app
  }

  if (!opts.typescript && !opts.javascript) {
    const { typescript } = await _prompt({
      type: 'toggle',
      name: 'typescript',
      message: `Would you like to use ${ct.typescript}?`,
    })
    opts.typescript = typescript
    opts.javascript = !typescript
    preferences.typescript = typescript
  }

  if (!opts.eslint && !args.includes('--no-eslint')) {
    const { eslint } = await _prompt({
      type: 'toggle',
      name: 'eslint',
      message: `Would you like to use ${ct.eslint}?`,
    })
    opts.eslint = eslint
    preferences.eslint = eslint
  }

  if (!opts.tailwind && !args.includes('--no-tailwind')) {
    const { tailwind } = await _prompt({
      type: 'toggle',
      name: 'tailwind',
      message: `Would you like to use ${ct.tailwind}?`,
    })
    opts.tailwind = tailwind
    preferences.tailwind = tailwind
  }

  if (!opts.srcDir && !args.includes('--no-src-dir')) {
    const { srcDir } = await _prompt({
      type: 'toggle',
      name: 'srcDir',
      message: `Would you like to use ${ct.srcDir} directory?`,
    })
    opts.srcDir = srcDir
    preferences.srcDir = srcDir
  }

  // Matches <prefix>/* except disallowed characters for paths: " or *
  // See https://github.com/vercel/next.js/pull/63855#issuecomment-2028572798
  const importAliasPattern = /^[^*"]+\/\*\s*$/
  function validateImportAlias(value: string): string | true {
    if (importAliasPattern.test(value)) {
      return true
    }

    const currentValue = `${gray(`… Current: ${bold(value)}`)}`

    // Has disallowed characters for paths: " or *
    if (/["*].*\/\*/.test(value)) {
      return `${ct.importAlias} cannot include ${bold(
        'asterisk (*)'
      )} or ${bold('double quote (")')} ${currentValue}`
    }

    return `${ct.importAlias} must follow the pattern ${bold(
      '<prefix>/*'
    )} ${currentValue}`
  }

  if (
    opts.importAlias &&
    typeof validateImportAlias(opts.importAlias) === 'string'
  ) {
    log.warn(validateImportAlias(opts.importAlias))
    opts.importAlias = undefined
  }

  if (!opts.importAlias && !args.includes('--no-import-alias')) {
    const { customizeImportAlias } = await _prompt({
      type: 'toggle',
      name: 'customizeImportAlias',
      message: `Would you like to customize the default ${ct.importAlias} (${defaults.importAlias})?`,
    })

    if (customizeImportAlias) {
      const { importAlias } = await _prompt({
        type: 'text',
        name: 'importAlias',
        message: `How would you like to configure the ${ct.importAlias}?`,
        validate: (value) => validateImportAlias(value),
      })
      opts.importAlias = importAlias
      preferences.importAlias = importAlias
    }
  }

  // Ensure the importAlias is set.
  opts.importAlias ??= defaults.importAlias

  const resolvedOpts: ResolvedCreateNextAppOptions = {
    typescript: Boolean(opts.typescript),
    eslint: Boolean(opts.eslint),
    tailwind: Boolean(opts.tailwind),
    app: Boolean(opts.app),
    srcDir: Boolean(opts.srcDir),
    importAlias: opts.importAlias,
  }
  await tryCreateNextApp({
    appPath,
    resolvedOpts,
    conf,
    preferences,
    isDryRun,
  })
}

async function tryCreateNextApp({
  appPath,
  resolvedOpts: { app, typescript, eslint, tailwind, srcDir, importAlias },
  example,
  conf,
  preferences,
  isDryRun,
}: {
  appPath: string
  resolvedOpts: ResolvedCreateNextAppOptions
  example?: string
  conf?: Conf
  preferences?: Record<string, boolean | string>
  isDryRun?: boolean
}) {
  if (isDryRun) {
    const dryRunData = {
      appPath,
      packageManager,
      opts,
      args,
      preferences,
    }
    console.log(JSON.stringify(dryRunData, null, 2))
    return
  }

  try {
    await createApp({
      appPath,
      packageManager,
      example: example !== 'default' ? example : undefined,
      examplePath: opts.examplePath,
      typescript,
      tailwind,
      eslint,
      appRouter: app,
      srcDir,
      importAlias,
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
      typescript,
      tailwind,
      eslint,
      appRouter: app,
      srcDir,
      importAlias,
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
