#!/usr/bin/env node
/**
 * Copyright 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
// Based on https://github.com/reactjs/react-codemod/blob/dd8671c9a470a2c342b221ec903c574cf31e9f57/bin/cli.js
// @next/codemod optional-name-of-transform optional/path/to/src [...options]

import type { InitialReturnValue } from 'prompts'
import { Command } from 'commander'
import { runUpgrade } from './upgrade'
import { runTransform } from './transform'

const handleSigTerm = () => process.exit(0)

process.on('SIGINT', handleSigTerm)
process.on('SIGTERM', handleSigTerm)

export const onPromptState = (state: {
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

const packageJson = require('../package.json')
const program = new Command(packageJson.name)
  .description('Codemods for updating Next.js apps.')
  .version(
    packageJson.version,
    '-v, --version',
    'Output the current version of @next/codemod.'
  )
  .helpOption('-h, --help', 'Display this help message.')
  .usage('[codemod] [source] [options]')
  .argument(
    '[codemod]',
    'Codemod slug to run. See "https://github.com/vercel/next.js/tree/canary/packages/next-codemod".'
  )
  .argument(
    '[source]',
    'Path to source files or directory to transform including glob patterns.'
  )
  .option('-f, --force', 'Bypass Git safety checks and forcibly run codemods')
  .option(
    '-j, --jscodeshift',
    '(Advanced) Pass options directly to jscodeshift'
  )
  .action(runTransform)

program
  .command('upgrade')
  .description(
    'Upgrade Next.js apps to desired versions with a single command.'
  )
  .usage('[version]')
  .argument(
    '[version]',
    'Version to upgrade to. Includes release tags like "canary", "rc", or "latest".'
  )
  .action(runUpgrade)

program.parse(process.argv)
