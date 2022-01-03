#!/usr/bin/env node
import chalk from 'next/dist/compiled/chalk'
import arg from 'next/dist/compiled/arg/index.js'
import { printAndExit } from '../server/lib/utils'
import { cliCommand } from '../bin/next'
import isError from '../lib/is-error'
import envinfo from 'envinfo'

const nextInfo: cliCommand = async (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    // Aliases
    '-h': '--help',
  }
  let args: arg.Result<arg.Spec>
  try {
    args = arg(validArgs, { argv })
  } catch (error) {
    if (isError(error) && error.code === 'ARG_UNKNOWN_OPTION') {
      return printAndExit(error.message, 1)
    }
    throw error
  }

  if (args['--help']) {
    console.log(
      `
      Description
        Provides useful debug information about Next.js. When opening a bug report, please include the result in the issue.

      Usage
        $ next info

      Learn more: ${chalk.cyan('https://nextjs.org/info')}
    `
    )
    return
  }

  const result = await envinfo.run({
    System: ['OS'],
    Binaries: ['Node', 'Yarn', 'npm'],
    Browsers: [
      'Brave Browser',
      'Chrome',
      'Chrome Canary',
      'Chromium',
      'Edge',
      'Firefox',
      'Firefox Developer Edition',
      'Firefox Nightly',
      'Internet Explorer',
      'Safari',
      'Safari Technology Preview',
    ],
    npmPackages: ['next', 'react', 'react-dom'],
  })

  console.log(result)

  console.log()
}

export { nextInfo }
