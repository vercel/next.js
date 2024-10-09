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

import { Command } from 'commander'
import { runUpgrade } from './upgrade'
import { runTransform } from './transform'

const packageJson = require('../package.json')
const program = new Command(packageJson.name)
  .description('Codemods for updating Next.js apps.')
  .version(
    packageJson.version,
    '-v, --version',
    'Output the current version of @next/codemod.'
  )
  .argument(
    '[codemod]',
    'Codemod slug to run. See "https://github.com/vercel/next.js/tree/canary/packages/next-codemod".'
  )
  .argument(
    '[source]',
    'Path to source files or directory to transform including glob patterns.'
  )
  .usage('[codemod] [source] [options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option('-f, --force', 'Bypass Git safety checks and forcibly run codemods')
  .option('-d, --dry', 'Dry run (no changes are made to files)')
  .option('-p, --print', 'Print transformed files to your terminal')
  .option(
    '-j, --jscodeshift',
    '(Advanced) Pass options directly to jscodeshift'
  )
  .action(runTransform)
  .allowUnknownOption()

program
  .command('upgrade')
  .description(
    'Upgrade Next.js apps to desired versions with a single command.'
  )
  .argument(
    '[revision]',
    'Specify the target Next.js version using an NPM dist tag (e.g. "latest", "canary", "rc") or an exact version number (e.g. "15.0.0").',
    packageJson.version.includes('-canary.')
      ? 'canary'
      : packageJson.version.includes('-rc.')
        ? 'rc'
        : 'latest'
  )
  .usage('[revision] [options]')
  .option('--verbose', 'Verbose output', false)
  .action(runUpgrade)

program.parse(process.argv)
