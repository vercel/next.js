#!/usr/bin/env node

import { Command, Option } from '@commander-js/extra-typings'

import semver from 'next/dist/compiled/semver'
import { bold, cyan, italic } from '../lib/picocolors'
import { myParseInt } from '../server/lib/utils'
import { nextBuild } from '../cli/future-next-build'
import { nextExport } from '../cli/next-export'
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
    `A directory on which to start the application. ${italic(
      'If no directory is provided, the current directory will be used.'
    )}`
  )
  .option('--debug', 'Enables a more verbose build output.')
  .option('--profile', 'Enables production profiling for React.')
  .option('--no-lint', 'Disables linting.')
  .option('--no-mangling', 'Disables mangling.')
  .option('--experimental-app-only', 'Builds only App Router routes.')
  .addOption(new Option('--experimental-turbo').hideHelp())
  .action((directory, options) => nextBuild(options, directory))

program.command('export', { hidden: true }).action(nextExport).helpOption(false)

program
  .command('start')
  .description(
    `Starts Next.js in production mode. The application should be compiled with \`next build\` first.`
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
  .action((directory, options) => nextStart(options, directory))

program
  .command('telemetry')
  .description(
    `Allows you to enable or disable Next.js' ${bold(
      'completely anonymous'
    )} telemetry collection.`
  )
  .addHelpText(
    'after',
    `\nLearn more: ${cyan('https://nextjs.org/telemetry')} `
  )
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
