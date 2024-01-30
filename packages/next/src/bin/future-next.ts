#!/usr/bin/env node

import { Command, Option } from '@commander-js/extra-typings'

import semver from 'next/dist/compiled/semver'
import { bold, cyan } from '../lib/picocolors'
import { nextExport } from '../cli/future-next-export'
import { nextTelemetry } from '../cli/future-next-telemetry'

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
  .version(`Next.js v${process.env.__NEXT_VERSION}`, '-v, --version')

program.command('export', { hidden: true }).action(nextExport).helpOption(false)

program
  .command('telemetry')
  .addHelpText('after', `\nLearn more: ${cyan('https://nextjs.org/telemetry')}`)
  .addOption(
    new Option('--enable', `enables Next.js' telemetry collection`).conflicts(
      'disable'
    )
  )
  .addOption(new Option('--disable', `disables Next.js' telemetry collection`))
  .description(
    `This \`next telemetry\` command allows you to enable or disable Next.js' ${bold(
      'completely anonymous'
    )} telemetry collection.`
  )
  .action((options) => nextTelemetry(options))

program.parse(process.argv)
