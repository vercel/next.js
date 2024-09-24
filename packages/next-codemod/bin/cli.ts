/**
 * Copyright 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
// Based on https://github.com/reactjs/react-codemod/blob/dd8671c9a470a2c342b221ec903c574cf31e9f57/bin/cli.js
// @next/codemod optional-name-of-transform optional/path/to/src [...options]

import globby from 'globby'
import inquirer from 'inquirer'
import path from 'path'
import execa from 'execa'
// import ciInfo from 'ci-info'
import { Command } from 'commander'
// import prompts from 'prompts'
import { installPackage, uninstallPackage } from '../lib/handle-package'
import { runUpgrade } from './upgrade'
import { checkGitStatus, TRANSFORMER_INQUIRER_CHOICES } from '../lib/utils'

export const jscodeshiftExecutable = require.resolve('.bin/jscodeshift')
export const transformerDirectory = path.join(__dirname, '../', 'transforms')

export function runTransform({ files, flags, transformer }) {
  const transformerPath = path.join(transformerDirectory, `${transformer}.js`)

  if (transformer === 'cra-to-next') {
    // cra-to-next transform doesn't use jscodeshift directly
    return require(transformerPath).default(files, flags)
  }

  let args = []

  const { dry, print, runInBand } = flags

  if (dry) {
    args.push('--dry')
  }
  if (print) {
    args.push('--print')
  }
  if (runInBand) {
    args.push('--run-in-band')
  }

  args.push('--verbose=2')

  args.push('--ignore-pattern=**/node_modules/**')
  args.push('--ignore-pattern=**/.next/**')

  args.push('--extensions=tsx,ts,jsx,js')

  args = args.concat(['--transform', transformerPath])

  if (flags.jscodeshift) {
    args = args.concat(flags.jscodeshift)
  }

  args = args.concat(files)

  console.log(`Executing command: jscodeshift ${args.join(' ')}`)

  const result = execa.sync(jscodeshiftExecutable, args, {
    stdio: 'inherit',
    stripFinalNewline: false,
  })

  if (result.failed) {
    throw new Error(`jscodeshift exited with code ${result.exitCode}`)
  }

  if (!dry && transformer === 'built-in-next-font') {
    console.log('Uninstalling `@next/font`')
    try {
      uninstallPackage('@next/font')
    } catch {
      console.error(
        "Couldn't uninstall `@next/font`, please uninstall it manually"
      )
    }
  }

  if (!dry && transformer === 'next-request-geo-ip') {
    console.log('Installing `@vercel/functions`...')
    installPackage('@vercel/functions')
  }
}

function expandFilePathsIfNeeded(filesBeforeExpansion) {
  const shouldExpandFiles = filesBeforeExpansion.some((file) =>
    file.includes('*')
  )
  return shouldExpandFiles
    ? globby.sync(filesBeforeExpansion)
    : filesBeforeExpansion
}

const packageJson = require('../package.json')
const program = new Command(packageJson.name)
  .description('Codemods for updating Next.js apps.')
  .version(
    packageJson.version,
    '-v, --version',
    'Output the current version of @next/codemod.'
  )
  .argument(
    '[transform]',
    'One of the choices from https://github.com/vercel/next.js/tree/canary/packages/next-codemod'
  )
  .argument(
    '[path]',
    'Files or directory to transform. Can be a glob like pages/**.js'
  )
  .usage('[transform] [path] [options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option('--force', 'Bypass Git safety checks and forcibly run codemods')
  .option('--dry', 'Dry run (no changes are made to files)')
  .option('--print', 'Print transformed files to your terminal')
  .option('--jscodeshift', '(Advanced) Pass options directly to jscodeshift')
  .action(run)
  .allowUnknownOption()
  .parse(process.argv)

const opts = program.opts()
const { args } = program

function run() {
  if (!opts.dry) {
    checkGitStatus(opts.force)
  }

  const isUpgrade = args[0] === 'upgrade' || args[0] === 'up'

  if (isUpgrade) {
    return runUpgrade().catch(console.error)
  }

  if (
    args[0] &&
    !TRANSFORMER_INQUIRER_CHOICES.find((x) => x.value === args[0])
  ) {
    console.error('Invalid transform choice, pick one of:')
    console.error(
      TRANSFORMER_INQUIRER_CHOICES.map((x) => '- ' + x.value).join('\n')
    )
    process.exit(1)
  }

  inquirer
    .prompt([
      {
        type: 'input',
        name: 'files',
        message: 'On which files or directory should the codemods be applied?',
        when: !args[1],
        default: '.',
        // validate: () =>
        filter: (files) => files.trim(),
      },
      {
        type: 'list',
        name: 'transformer',
        message: 'Which transform would you like to apply?',
        when: !args[0],
        pageSize: TRANSFORMER_INQUIRER_CHOICES.length,
        choices: TRANSFORMER_INQUIRER_CHOICES,
      },
    ])
    .then((answers) => {
      const { files, transformer } = answers

      const filesBeforeExpansion = args[1] || files
      const filesExpanded = expandFilePathsIfNeeded([filesBeforeExpansion])

      const selectedTransformer = args[0] || transformer

      if (!filesExpanded.length) {
        console.log(`No files found matching ${filesBeforeExpansion.join(' ')}`)
        return null
      }

      return runTransform({
        files: filesExpanded,
        flags: opts,
        transformer: selectedTransformer,
      })
    })
}
