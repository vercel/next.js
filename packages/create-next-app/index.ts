#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */
import Conf from 'conf'
import prompts from 'prompts'
import updateCheck from 'update-check'
import packageJson from './package.json'
import { basename, resolve } from 'path'
import { isCI } from 'ci-info'
import { Command, Option } from 'commander'
import {
  blue,
  yellow,
  green,
  magenta,
  red,
  gray,
  bold,
  italic,
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

const styled = (text: string) => blue(text)

const { name: pkgName, version } = packageJson

/**
 * Colored Texts
 */
const ct = {
  cna: italic(pkgName),
  typescript: blue('TypeScript'),
  javascript: yellow('JavaScript'),
  app: red('App Router'),
  tailwind: green('Tailwind CSS'),
  eslint: magenta('ESLint'),
  default: gray('(default)'),
}

const program = new Command()
  .name(pkgName)
  .version(
    `${pkgName} v${version}`,
    '-v, --version',
    `Output the current version of ${ct.cna}.`
  )
  .arguments('[directory]')
  .usage('[directory] [options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option(
    '--ts, --typescript',
    `Initialize as a ${ct.typescript} project. ${ct.default}`
  )
  .option('--js, --javascript', `Initialize as a ${ct.javascript} project.`)
  .option('--app', `Initialize as an ${ct.app} project. ${ct.default}`)
  .option('--tailwind', `Enable ${ct.tailwind} config. ${ct.default}`)
  .option('--eslint', `Enable ${ct.eslint} config. ${ct.default}`)
  .option('--src-dir', `Initialize inside a ${bold('"src/"')} directory.`)
  .option(
    '--import-alias <prefix/*>',
    `Specify import alias to use. ${gray('(default: "@/*")')}`
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
    '-e, --example <name|github-url>',
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

async function run(): Promise<void> {
  const conf = new Conf({ projectName: 'create-next-app' })

  if (opts.resetPreferences) {
    const { reset } = await prompts({
      onState: onPromptState,
      type: 'toggle',
      name: 'reset',
      message: 'Would you like to reset the saved preferences?',
      initial: false,
      active: 'Yes',
      inactive: 'No',
    })
    if (reset) {
      conf.clear()
      return log.event('The preferences have been reset successfully!')
    }
    process.exit(0)
  }

  let projectPath = args[0]?.trim()
  if (!projectPath || projectPath.startsWith('-')) {
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

  const defaults = {
    typescript: true,
    eslint: true,
    tailwind: true,
    app: true,
    srcDir: false,
    importAlias: '@/*',
    customizeImportAlias: false,
  }
  const preferences = (conf.get('preferences') ?? {}) as typeof defaults

  if (opts.example) {
    return await tryCreateNextApp({
      appPath,
      resolvedOpts: opts as ResolvedCreateNextAppOptions,
      example: opts.example.trim(),
      conf,
      preferences,
    })
  }

  const getPrefOrDefault = (field: keyof typeof defaults) =>
    preferences[field] ?? defaults[field]

  if (isCI) {
    if (!opts.typescript && !opts.javascript) {
      // default to TypeScript in CI as we can't prompt to
      // prevent breaking setup flows
      opts.typescript = Boolean(getPrefOrDefault('typescript'))
    }

    if (!opts.eslint && !args.includes('--no-eslint')) {
      opts.eslint = Boolean(getPrefOrDefault('eslint'))
    }

    if (!opts.tailwind && !args.includes('--no-tailwind')) {
      opts.tailwind = Boolean(getPrefOrDefault('tailwind'))
    }

    if (!opts.srcDir && !args.includes('--no-src-dir')) {
      opts.srcDir = Boolean(getPrefOrDefault('srcDir'))
    }

    if (!opts.app && !args.includes('--no-app')) {
      opts.app = Boolean(getPrefOrDefault('app'))
    }

    if (!opts.importAlias) {
      // We don't use preferences here because the default value is @/* regardless of existing preferences
      opts.importAlias = defaults.importAlias as string
    }

    return await tryCreateNextApp({
      appPath,
      resolvedOpts: opts as ResolvedCreateNextAppOptions,
      conf,
      preferences,
    })
  }

  async function prompt(
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

  if (!opts.typescript && !opts.javascript) {
    const { typescript } = await prompt({
      type: 'toggle',
      name: 'typescript',
      message: `Would you like to use ${styled('TypeScript')}?`,
    })
    /**
     * Depending on the prompt response, set the appropriate program flags.
     */
    opts.typescript = Boolean(typescript)
    opts.javascript = !Boolean(typescript)
    preferences.typescript = Boolean(typescript)
  }

  if (!opts.eslint && !args.includes('--no-eslint')) {
    const { eslint } = await prompt({
      type: 'toggle',
      name: 'eslint',
      message: `Would you like to use ${styled('ESLint')}?`,
    })
    opts.eslint = Boolean(eslint)
    preferences.eslint = Boolean(eslint)
  }

  if (!opts.tailwind && !args.includes('--no-tailwind')) {
    const { tailwind } = await prompt({
      type: 'toggle',
      name: 'tailwind',
      message: `Would you like to use ${styled('Tailwind CSS')}?`,
    })
    opts.tailwind = Boolean(tailwind)
    preferences.tailwind = Boolean(tailwind)
  }

  if (!opts.srcDir && !args.includes('--no-src-dir')) {
    const { srcDir } = await prompt({
      type: 'toggle',
      name: 'srcDir',
      message: `Would you like to use ${styled('`src/` directory')}?`,
    })
    opts.srcDir = Boolean(srcDir)
    preferences.srcDir = Boolean(srcDir)
  }

  if (!opts.app && !args.includes('--no-app')) {
    const { app } = await prompt({
      type: 'toggle',
      name: 'app',
      message: `Would you like to use ${styled('App Router')}? (recommended)`,
    })
    opts.app = Boolean(app)
  }

  if (typeof opts.importAlias !== 'string' || !opts.importAlias.length) {
    if (args.includes('--no-import-alias')) {
      opts.importAlias = defaults.importAlias
    } else {
      const styledImportAlias = styled('import alias')

      const { customizeImportAlias } = await prompt({
        type: 'toggle',
        name: 'customizeImportAlias',
        message: `Would you like to customize the default ${styledImportAlias} (${defaults.importAlias})?`,
      })

      if (!customizeImportAlias) {
        // We don't use preferences here because the default value is @/* regardless of existing preferences
        opts.importAlias = defaults.importAlias
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
        opts.importAlias = importAlias
        preferences.importAlias = importAlias
      }
    }
  }

  await tryCreateNextApp({
    appPath,
    resolvedOpts: opts as ResolvedCreateNextAppOptions,
    conf,
    preferences,
  })
}

async function tryCreateNextApp({
  appPath,
  resolvedOpts: { typescript, eslint, tailwind, app, srcDir, importAlias },
  example,
  conf,
  preferences,
}: {
  appPath: string
  resolvedOpts: ResolvedCreateNextAppOptions
  example?: string
  conf?: Conf
  preferences?: Record<string, boolean | string>
}) {
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
