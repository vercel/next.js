#!/usr/bin/env node

import '../server/require-hook'

import { Argument, Command, Option } from 'next/dist/compiled/commander'

import { warn } from '../build/output/log'
import semver from 'next/dist/compiled/semver'
import { bold, cyan, italic } from '../lib/picocolors'
import { formatCliHelpOutput } from '../lib/format-cli-help-output'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import { myParseInt } from '../server/lib/utils'

if (
  semver.lt(process.versions.node, process.env.__NEXT_REQUIRED_NODE_VERSION!)
) {
  console.error(
    `You are using Node.js ${process.versions.node}. For Next.js, Node.js version >= v${process.env.__NEXT_REQUIRED_NODE_VERSION} is required.`
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

class MyRootCommand extends Command {
  createCommand(name: string) {
    const cmd = new Command(name)

    cmd.addOption(new Option('--inspect').hideHelp())

    cmd.hook('preAction', (thisCommand) => {
      const cmdName = thisCommand.name()
      const defaultEnv = cmdName === 'dev' ? 'development' : 'production'
      const standardEnv = ['production', 'development', 'test']

      if (process.env.NODE_ENV) {
        const isNotStandard = !standardEnv.includes(process.env.NODE_ENV)
        const shouldWarnCommands =
          process.env.NODE_ENV === 'development'
            ? ['start', 'build']
            : process.env.NODE_ENV === 'production'
            ? ['dev']
            : []

        if (isNotStandard || shouldWarnCommands.includes(cmdName)) {
          warn(NON_STANDARD_NODE_ENV)
        }
      }

      ;(process.env as any).NODE_ENV = process.env.NODE_ENV || defaultEnv
      ;(process.env as any).NEXT_RUNTIME = 'nodejs'

      if (thisCommand.getOptionValue('inspect') === true) {
        console.error(
          `\`--inspect\` flag is deprecated. Use env variable NODE_OPTIONS instead: NODE_OPTIONS='--inspect' next ${cmdName}`
        )
        process.exit(1)
      }
    })

    return cmd
  }
}

const program = new MyRootCommand()

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
  .option('--profile', 'Enables production profiling for React.')
  .option('--no-lint', 'Disables linting.')
  .option('--no-mangling', 'Disables mangling.')
  .option('--experimental-app-only', 'Builds only App Router routes.')
  .addOption(new Option('--experimental-turbo').hideHelp())
  .addOption(
    new Option(
      '--experimental-build-mode [mode]',
      'Uses an experimental build mode.'
    )
      .choices(['compile', 'generate'])
      .default('default')
  )
  .action((directory, options) =>
    // ensure process exits after build completes so open handles/connections
    // don't cause process to hang
    import('../cli/next-build.js').then((mod) =>
      mod.nextBuild(options, directory).then(() => process.exit(0))
    )
  )
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
  .option('--turbo', 'Starts development mode using Turbopack (beta).')
  .addOption(
    new Option(
      '-p, --port <port>',
      'Specify a port number on which to start the application.'
    )
      .argParser(myParseInt)
      .default(3000)
      .env('PORT')
  )
  .option(
    '-H, --hostname <hostname>',
    'Specify a hostname on which to start the application (default: 0.0.0.0).'
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
  .addOption(new Option('--experimental-test-proxy').hideHelp())
  .action((directory, options) =>
    import('../cli/next-dev.js').then((mod) => mod.nextDev(options, directory))
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
  .action((options) =>
    import('../cli/next-info.js').then((mod) => mod.nextInfo(options))
  )

program
  .command('lint')
  .description(
    'Runs ESLint for all files in the `/src`, `/app`, `/pages`, `/components`, and `/lib` directories. It also provides a guided setup to install any required dependencies if ESLint is not already configured in your application.'
  )
  .argument(
    '[directory]',
    `A base directory on which to lint the application. ${italic(
      'If no directory is provided, the current directory will be used.'
    )}`
  )
  .option(
    '-d, --dir, <dirs...>',
    'Include directory, or directories, to run ESLint.'
  )
  .option('--file, <files...>', 'Include file, or files, to run ESLint.')
  .addOption(
    new Option(
      '--ext, [exts...]',
      'Specify JavaScript file extensions.'
    ).default(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'])
  )
  .option(
    '-c, --config, <config>',
    'Uses this configuration file, overriding all other configuration options.'
  )
  .option(
    '--resolve-plugins-relative-to, <rprt>',
    'Specify a directory where plugins should be resolved from.'
  )
  .option(
    '--strict',
    'Creates a `.eslintrc.json` file using the Next.js strict configuration.'
  )
  .option(
    '--rulesdir, <rulesdir...>',
    'Uses additional rules from this directory(s).'
  )
  .option('--fix', 'Automatically fix linting issues.')
  .option(
    '--fix-type <fixType>',
    'Specify the types of fixes to apply (e.g., problem, suggestion, layout).'
  )
  .option('--ignore-path <path>', 'Specify a file to ignore.')
  .option('--no-ignore', 'Disables the `--ignore-path` option.')
  .option('--quiet', 'Reports errors only.')
  .addOption(
    new Option(
      '--max-warnings [maxWarnings]',
      'Specify the number of warnings before triggering a non-zero exit code.'
    )
      .argParser(myParseInt)
      .default(-1)
  )
  .option(
    '-o, --output-file, <outputFile>',
    'Specify a file to write report to.'
  )
  .option('-f, --format, <format>', 'Uses a specific output format.')
  .option(
    '--no-inline-config',
    'Prevents comments from changing config or rules.'
  )
  .option(
    '--report-unused-disable-directives',
    'Adds reported errors for unused eslint-disable directives.'
  )
  .option('--no-cache', 'Disables caching.')
  .option('--cache-location, <cacheLocation>', 'Specify a location for cache.')
  .addOption(
    new Option(
      '--cache-strategy, [cacheStrategy]',
      'Specify a strategy to use for detecting changed files in the cache.'
    ).default('metadata')
  )
  .option(
    '--error-on-unmatched-pattern',
    'Reports errors when any file patterns are unmatched.'
  )
  .action((directory, options) =>
    import('../cli/next-lint.js').then((mod) =>
      mod.nextLint(options, directory)
    )
  )
  .usage('[directory] [options]')

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
      .argParser(myParseInt)
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
    ).argParser(myParseInt)
  )
  .addOption(new Option('--experimental-test-proxy').hideHelp())
  .action((directory, options) =>
    import('../cli/next-start.js').then((mod) =>
      mod.nextStart(options, directory)
    )
  )
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
  .action((arg, options) =>
    import('../cli/next-telemetry.js').then((mod) =>
      mod.nextTelemetry(options, arg)
    )
  )
  .usage('[options]')

program.parse(process.argv)
