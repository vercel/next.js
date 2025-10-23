#!/usr/bin/env node

import '../server/require-hook'

import { Argument, Command, Option } from 'next/dist/compiled/commander'

import { warn } from '../build/output/log'
import semver from 'next/dist/compiled/semver'
import { bold, cyan, italic } from '../lib/picocolors'
import { formatCliHelpOutput } from '../lib/format-cli-help-output'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import { parseValidPositiveInteger } from '../server/lib/utils'
import {
  SUPPORTED_TEST_RUNNERS_LIST,
  type NextTestOptions,
} from '../cli/next-test.js'
import type { NextTelemetryOptions } from '../cli/next-telemetry.js'
import type { NextStartOptions } from '../cli/next-start.js'
import type { NextInfoOptions } from '../cli/next-info.js'
import type { NextDevOptions } from '../cli/next-dev.js'
import type { NextBuildOptions } from '../cli/next-build.js'
import type { NextTypegenOptions } from '../cli/next-typegen.js'

if (process.env.NEXT_RSPACK) {
  // silent rspack's schema check
  process.env.RSPACK_CONFIG_VALIDATE = 'loose-silent'
}

if (
  !semver.satisfies(
    process.versions.node,
    process.env.__NEXT_REQUIRED_NODE_VERSION_RANGE!,
    { includePrerelease: true }
  )
) {
  console.error(
    `You are using Node.js ${process.versions.node}. For Next.js, Node.js version "${process.env.__NEXT_REQUIRED_NODE_VERSION_RANGE}" is required.`
  )
  process.exit(1)
}

// Start performance profiling after Node.js version is checked
performance.mark('next-start')

for (const dependency of ['react', 'react-dom']) {
  try {
    // When 'npm link' is used it checks the clone location. Not the project.
    require.resolve(dependency)
  } catch (err) {
    console.warn(
      `The module '${dependency}' was not found. Next.js requires that you include it in 'dependencies' of your 'package.json'. To add it, run 'npm install ${dependency}'`
    )
  }
}

class NextRootCommand extends Command {
  createCommand(name: string) {
    const command = new Command(name)

    command.addOption(new Option('--inspect').hideHelp())

    command.hook('preAction', (event) => {
      const commandName = event.name()
      const defaultEnv = commandName === 'dev' ? 'development' : 'production'
      const standardEnv = ['production', 'development', 'test']

      if (process.env.NODE_ENV) {
        const isNotStandard = !standardEnv.includes(process.env.NODE_ENV)
        const shouldWarnCommands =
          process.env.NODE_ENV === 'development'
            ? ['start', 'build']
            : process.env.NODE_ENV === 'production'
              ? ['dev']
              : []

        if (isNotStandard || shouldWarnCommands.includes(commandName)) {
          warn(NON_STANDARD_NODE_ENV)
        }
      }

      ;(process.env as any).NODE_ENV = process.env.NODE_ENV || defaultEnv
      ;(process.env as any).NEXT_RUNTIME = 'nodejs'

      if (event.getOptionValue('inspect') === true) {
        console.error(
          `\`--inspect\` flag is deprecated. Use env variable NODE_OPTIONS instead: NODE_OPTIONS='--inspect' next ${commandName}`
        )
        process.exit(1)
      }
    })

    return command
  }
}

const program = new NextRootCommand()

program
  .name('next')
  .description(
    'The Next.js CLI allows you to develop, build, start your application, and more.'
  )
  .configureHelp({
    formatHelp: (cmd, helper) => formatCliHelpOutput(cmd, helper),
    subcommandTerm: (cmd) => `${cmd.name()} ${cmd.usage()}`,
  })
  .helpCommand(false)
  .helpOption('-h, --help', 'Displays this message.')
  .version(
    `Next.js v${process.env.__NEXT_VERSION}`,
    '-v, --version',
    'Outputs the Next.js version.'
  )

program
  .command('build')
  .description(
    'Creates an optimized production build of your application. The output displays information about each route.'
  )
  .argument(
    '[directory]',
    `A directory on which to build the application. ${italic(
      'If no directory is provided, the current directory will be used.'
    )}`
  )
  .option('-d, --debug', 'Enables a more verbose build output.')
  .option(
    '--debug-prerender',
    'Enables debug mode for prerendering. Not for production use!'
  )
  .option('--no-mangling', 'Disables mangling.')
  .option('--profile', 'Enables production profiling for React.')
  .option('--experimental-app-only', 'Builds only App Router routes.')
  .option('--turbo', 'Builds using Turbopack.')
  .option('--turbopack', 'Builds using Turbopack.')
  .option('--webpack', 'Builds using webpack.')
  .addOption(
    new Option(
      '--experimental-build-mode [mode]',
      'Uses an experimental build mode.'
    )
      .choices(['compile', 'generate', 'generate-env'])
      .default('default')
  )
  .option(
    '--experimental-debug-memory-usage',
    'Enables memory profiling features to debug memory consumption.'
  )
  .option(
    '--experimental-upload-trace, <traceUrl>',
    'Reports a subset of the debugging trace to a remote HTTP URL. Includes sensitive data.'
  )
  .option(
    '--experimental-next-config-strip-types',
    'Use Node.js native TypeScript resolution for next.config.(ts|mts)'
  )
  .option(
    '--debug-build-paths <patterns>',
    'Comma-separated glob patterns or explicit paths for selective builds. Examples: "app/*", "app/page.tsx", "app/**/page.tsx"'
  )
  .action((directory: string, options: NextBuildOptions) => {
    if (options.experimentalNextConfigStripTypes) {
      process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = 'true'
    }
    // ensure process exits after build completes so open handles/connections
    // don't cause process to hang
    return import('../cli/next-build.js').then((mod) =>
      mod.nextBuild(options, directory).then(() => process.exit(0))
    )
  })
  .usage('[directory] [options]')

program
  .command('dev', { isDefault: true })
  .description(
    'Starts Next.js in development mode with hot-code reloading, error reporting, and more.'
  )
  .argument(
    '[directory]',
    `A directory on which to build the application. ${italic(
      'If no directory is provided, the current directory will be used.'
    )}`
  )
  .option('--turbo', 'Starts development mode using Turbopack.')
  .option('--turbopack', 'Starts development mode using Turbopack.')
  .option('--webpack', 'Starts development mode using webpack.')
  .addOption(
    new Option(
      '-p, --port <port>',
      'Specify a port number on which to start the application.'
    )
      .argParser(parseValidPositiveInteger)
      .default(3000)
      .env('PORT')
  )
  .option(
    '-H, --hostname <hostname>',
    'Specify a hostname on which to start the application (default: 0.0.0.0).'
  )
  .option(
    '--disable-source-maps',
    "Don't start the Dev server with `--enable-source-maps`.",
    false
  )
  .option(
    '--experimental-https',
    'Starts the server with HTTPS and generates a self-signed certificate.'
  )
  .option('--experimental-https-key, <path>', 'Path to a HTTPS key file.')
  .option(
    '--experimental-https-cert, <path>',
    'Path to a HTTPS certificate file.'
  )
  .option(
    '--experimental-https-ca, <path>',
    'Path to a HTTPS certificate authority file.'
  )
  .option(
    '--experimental-upload-trace, <traceUrl>',
    'Reports a subset of the debugging trace to a remote HTTP URL. Includes sensitive data.'
  )
  .option(
    '--experimental-next-config-strip-types',
    'Use Node.js native TypeScript resolution for next.config.(ts|mts)'
  )
  .action(
    (directory: string, options: NextDevOptions, { _optionValueSources }) => {
      if (options.experimentalNextConfigStripTypes) {
        process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = 'true'
      }
      const portSource = _optionValueSources.port
      import('../cli/next-dev.js').then((mod) =>
        mod.nextDev(options, portSource, directory)
      )
    }
  )
  .usage('[directory] [options]')

program
  .command('export', { hidden: true })
  .action(() => import('../cli/next-export.js').then((mod) => mod.nextExport()))
  .helpOption(false)

program
  .command('info')
  .description(
    'Prints relevant details about the current system which can be used to report Next.js bugs.'
  )
  .addHelpText(
    'after',
    `\nLearn more: ${cyan('https://nextjs.org/docs/api-reference/cli#info')}`
  )
  .option('--verbose', 'Collects additional information for debugging.')
  .action((options: NextInfoOptions) =>
    import('../cli/next-info.js').then((mod) => mod.nextInfo(options))
  )

program
  .command('start')
  .description(
    'Starts Next.js in production mode. The application should be compiled with `next build` first.'
  )
  .argument(
    '[directory]',
    `A directory on which to start the application. ${italic(
      'If no directory is provided, the current directory will be used.'
    )}`
  )
  .addOption(
    new Option(
      '-p, --port <port>',
      'Specify a port number on which to start the application.'
    )
      .argParser(parseValidPositiveInteger)
      .default(3000)
      .env('PORT')
  )
  .option(
    '-H, --hostname <hostname>',
    'Specify a hostname on which to start the application (default: 0.0.0.0).'
  )
  .addOption(
    new Option(
      '--keepAliveTimeout <keepAliveTimeout>',
      'Specify the maximum amount of milliseconds to wait before closing inactive connections.'
    ).argParser(parseValidPositiveInteger)
  )
  .option(
    '--experimental-next-config-strip-types',
    'Use Node.js native TypeScript resolution for next.config.(ts|mts)'
  )
  .action((directory: string, options: NextStartOptions) => {
    if (options.experimentalNextConfigStripTypes) {
      process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = 'true'
    }
    return import('../cli/next-start.js').then((mod) =>
      mod.nextStart(options, directory)
    )
  })
  .usage('[directory] [options]')

program
  .command('telemetry')
  .description(
    `Allows you to enable or disable Next.js' ${bold(
      'completely anonymous'
    )} telemetry collection.`
  )
  .addArgument(new Argument('[arg]').choices(['disable', 'enable', 'status']))
  .addHelpText('after', `\nLearn more: ${cyan('https://nextjs.org/telemetry')}`)
  .addOption(
    new Option('--enable', `Enables Next.js' telemetry collection.`).conflicts(
      'disable'
    )
  )
  .option('--disable', `Disables Next.js' telemetry collection.`)
  .action((arg: string, options: NextTelemetryOptions) =>
    import('../cli/next-telemetry.js').then((mod) =>
      mod.nextTelemetry(options, arg)
    )
  )

program
  .command('typegen')
  .description(
    'Generate TypeScript definitions for routes, pages, and layouts without running a full build.'
  )
  .argument(
    '[directory]',
    `A directory on which to generate types. ${italic(
      'If no directory is provided, the current directory will be used.'
    )}`
  )
  .action((directory: string, options: NextTypegenOptions) =>
    // ensure process exits after typegen completes so open handles/connections
    // don't cause process to hang
    import('../cli/next-typegen.js').then((mod) =>
      mod.nextTypegen(options, directory).then(() => process.exit(0))
    )
  )
  .usage('[directory] [options]')

program
  .command('experimental-test')
  .description(
    `Execute \`next/experimental/testmode\` tests using a specified test runner. The test runner defaults to 'playwright' if the \`experimental.defaultTestRunner\` configuration option or the \`--test-runner\` option are not set.`
  )
  .argument(
    '[directory]',
    `A Next.js project directory to execute the test runner on. ${italic(
      'If no directory is provided, the current directory will be used.'
    )}`
  )
  .argument(
    '[test-runner-args...]',
    'Any additional arguments or options to pass down to the test runner `test` command.'
  )
  .option(
    '--test-runner [test-runner]',
    `Any supported test runner. Options: ${bold(
      SUPPORTED_TEST_RUNNERS_LIST.join(', ')
    )}. ${italic(
      "If no test runner is provided, the Next.js config option `experimental.defaultTestRunner`, or 'playwright' will be used."
    )}`
  )
  .allowUnknownOption()
  .action(
    (directory: string, testRunnerArgs: string[], options: NextTestOptions) => {
      return import('../cli/next-test.js').then((mod) => {
        mod.nextTest(directory, testRunnerArgs, options)
      })
    }
  )
  .usage('[directory] [options]')

const internal = program
  .command('internal')
  .description(
    'Internal debugging commands. Use with caution. Not covered by semver.'
  )

internal
  .command('trace')
  .alias('turbo-trace-server')
  .argument('file', 'Trace file to serve.')
  .addOption(
    new Option('-p, --port <port>', 'Override the port.').argParser(
      parseValidPositiveInteger
    )
  )
  .action((file: string, options: { port: number | undefined }) => {
    return import('../cli/internal/turbo-trace-server.js').then((mod) =>
      mod.startTurboTraceServerCli(file, options.port)
    )
  })

program.parse(process.argv)
