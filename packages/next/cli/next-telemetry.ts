#!/usr/bin/env node
import chalk from 'chalk'
import arg from 'next/dist/compiled/arg/index.js'

import { cliCommand } from '../bin/next'
import { setTelemetryEnabled, isTelemetryEnabled } from '../telemetry/storage'

const nextTelemetry: cliCommand = argv => {
  const args = arg(
    {
      // Types
      '--help': Boolean,
      '--enable': Boolean,
      '--disable': Boolean,
      // Aliases
      '-h': '--help',
    },
    { argv }
  )

  if (args['--help']) {
    console.log(
      `
      Description
        Allows you to control Next.js' telemetry collection

      Usage
        $ next telemetry [--enable] [--disable]

      You may pass the '--enable' or '--disable' flag to turn Next.js' telemetry collection on or off.

      Learn more: ${chalk.cyan('https://nextjs.org/telemetry')}
    `
    )
    return
  }

  if (args['--enable']) {
    setTelemetryEnabled(true)
    console.log(chalk.cyan('Success!'))
    console.log()
  } else if (args['--disable']) {
    setTelemetryEnabled(false)
    console.log(chalk.cyan('Your preference has been saved.'))
    console.log()
  } else {
    console.log(chalk.bold('Next.js Telemetry'))
    console.log()
  }

  const isEnabled = isTelemetryEnabled()
  console.log(
    `Status: ${
      isEnabled ? chalk.bold.green('Enabled') : chalk.bold.red('Disabled')
    }`
  )
  console.log()

  if (isEnabled) {
    console.log(
      `Next.js telemetry is completely anonymous. Thank you for participating!`
    )
  } else {
    console.log(`You have opted-out of Next.js' anonymous telemetry program.`)
    console.log(`No data will be collected from your machine.`)
  }

  console.log(`Learn more: https://nextjs.org/telemetry`)
  console.log()
}

export { nextTelemetry }
