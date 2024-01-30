#!/usr/bin/env node

import { Command, Option } from '@commander-js/extra-typings'

import semver from 'next/dist/compiled/semver'
import { bold, cyan } from '../lib/picocolors'
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

program.command('export').error(
  `The "next export" command has been removed in favor of "output: export" in next.config.js.\nLearn more: ${cyan(
    'https://nextjs.org/docs/advanced-features/static-html-export'
  )}
`,
  { exitCode: 1 }
)

program
  .command('telemetry')
  .addHelpText('after', `\nLearn more: ${cyan('https://nextjs.org/telemetry')}`)
  .description(
    `This command allows you to enable or disable Next.js' ${bold(
      'completely anonymous'
    )} telemetry collection.`
  )
  .addOption(
    new Option('--enable', `enables Next.js' telemetry collection`).conflicts(
      'disable'
    )
  )
  .addOption(new Option('--disable', `disables Next.js' telemetry collection`))
  .action((options) => nextTelemetry(options))

program.parse(process.argv)
