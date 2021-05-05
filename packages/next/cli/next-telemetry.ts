#!/usr/bin/env node
import chalk from 'chalk'
import arg from 'next/dist/compiled/arg/index.js'
import { printAndExit } from '../server/lib/utils'
import { cliCommand } from '../bin/next'
import { Telemetry } from '../telemetry/storage'

const nextTelemetry: cliCommand = (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    '--enable': Boolean,
    '--disable': Boolean,
    // Aliases
    '-h': '--help',
  }
  let args: arg.Result<arg.Spec>
  try {
    args = arg(validArgs, { argv })
  } catch (error) {
    if (error.code === 'ARG_UNKNOWN_OPTION') {
      return printAndExit(error.message, 1)
    }
    throw error
  }

  if (args['--help']) {
    console.log(
      `
      Description
        Allows you to control Next.js' telemetry collection

      Usage
        $ next telemetry [enable/disable]

      You may pass the 'enable' or 'disable' argument to turn Next.js' telemetry collection on or off.

      Learn more: ${chalk.cyan('https://nextjs.org/telemetry')}
    `
    )
    return
  }

  const telemetry = new Telemetry({ distDir: process.cwd() })

  let isEnabled = telemetry.isEnabled

  if (args['--enable'] || args._[0] === 'enable') {
    telemetry.setEnabled(true)
    console.log(chalk.cyan('Success!'))
    console.log()

    isEnabled = true
  } else if (args['--disable'] || args._[0] === 'disable') {
    telemetry.setEnabled(false)
    if (isEnabled) {
      console.log(chalk.cyan('Your preference has been saved.'))
    } else {
      console.log(
        chalk.yellow(`Next.js' telemetry collection is already disabled.`)
      )
    }
    console.log()

    isEnabled = false
  } else {
    console.log(chalk.bold('Next.js Telemetry'))
    console.log()
  }

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
