#!/usr/bin/env node

import { Command, Option } from 'commander'

import semver from 'next/dist/compiled/semver'
import { bold, cyan, italic } from '../lib/picocolors'
import { formatCliHelpOutput } from '../lib/format-cli-help-output'
import { myParseInt } from '../server/lib/utils'
import { nextBuild } from '../cli/next-build'
import { nextExport } from '../cli/next-export'
import { nextInfo } from '../cli/next-info'
import { nextLint } from '../cli/next-lint'
import { nextStart } from '../cli/next-start'
import { nextTelemetry } from '../cli/next-telemetry'

if (
  semver.lt(process.versions.node, process.env.__NEXT_REQUIRED_NODE_VERSION!)
) {
  console.error(
    `You are using Node.js ${process.versions.node}. For Next.js, Node.js version >= v${process.env.__NEXT_REQUIRED_NODE_VERSION} is required.`
  )
  process.exit(1)
}

const program = new Command()

program
  .name('next')
  .description(
    'The Next.js CLI allows you to start, build, and export your application.'
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
  .option('--debug', 'Enables a more verbose build output.')
  .option('--profile', 'Enables production profiling for React.')
  .option('--no-lint', 'Disables linting.')
  .option('--no-mangling', 'Disables mangling.')
  .option('--experimental-app-only', 'Builds only App Router routes.')
  .addOption(new Option('--experimental-turbo').hideHelp())
  .addOption(
    new Option('--build-mode [mode]')
      .choices(['experimental-compile', 'experimental-generate'])
      .default('default')
      .hideHelp()
  )
  .action((directory, options) => nextBuild(options, directory))
  .usage('[directory] [options]')

program.command('export', { hidden: true }).action(nextExport).helpOption(false)

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
  .action((options) => nextInfo(options))

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
  .option('--output-file, <outputFile>', 'Specify a file to write report to.')
  .option('--format, <format>', 'Uses a specific output format.')
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
      'Specify a strategy to use for decting changed files in the cache.'
    ).default('metadata')
  )
  .option(
    '--error-on-unmatched-pattern',
    'Reports errors when any file patterns are unmatched.'
  )
  .action((directory, options) => nextLint(options, directory))
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
      '-p, --port [port]',
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
  .action((directory, options) => nextStart(options, directory))
  .usage('[directory] [options]')

program
  .command('telemetry')
  .description(
    `Allows you to enable or disable Next.js' ${bold(
      'completely anonymous'
    )} telemetry collection.`
  )
  .addHelpText('after', `\nLearn more: ${cyan('https://nextjs.org/telemetry')}`)
  .addOption(
    new Option('--enable', `Enables Next.js' telemetry collection.`).conflicts(
      'disable'
    )
  )
  .option('--disable', `Disables Next.js' telemetry collection.`)
  .action((options) => {
    nextTelemetry(options)
  })

program.parse(process.argv)
