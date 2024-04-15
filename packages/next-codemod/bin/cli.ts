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
import meow from 'meow'
import path from 'path'
import execa from 'execa'
import { yellow } from 'picocolors'
import isGitClean from 'is-git-clean'
import { uninstallPackage } from '../lib/uninstall-package'

export const jscodeshiftExecutable = require.resolve('.bin/jscodeshift')
export const transformerDirectory = path.join(__dirname, '../', 'transforms')

export function checkGitStatus(force) {
  let clean = false
  let errorMessage = 'Unable to determine if git directory is clean'
  try {
    clean = isGitClean.sync(process.cwd())
    errorMessage = 'Git directory is not clean'
  } catch (err) {
    if (err && err.stderr && err.stderr.includes('Not a git repository')) {
      clean = true
    }
  }

  if (!clean) {
    if (force) {
      console.log(`WARNING: ${errorMessage}. Forcibly continuing.`)
    } else {
      console.log('Thank you for using @next/codemod!')
      console.log(
        yellow(
          '\nBut before we continue, please stash or commit your git changes.'
        )
      )
      console.log(
        '\nYou may use the --force flag to override this safety check.'
      )
      process.exit(1)
    }
  }
}

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
}

const TRANSFORMER_INQUIRER_CHOICES = [
  {
    name: 'name-default-component: Transforms anonymous components into named components to make sure they work with Fast Refresh',
    value: 'name-default-component',
  },
  {
    name: 'add-missing-react-import: Transforms files that do not import `React` to include the import in order for the new React JSX transform',
    value: 'add-missing-react-import',
  },
  {
    name: 'withamp-to-config: Transforms the withAmp HOC into Next.js 9 page configuration',
    value: 'withamp-to-config',
  },
  {
    name: 'url-to-withrouter: Transforms the deprecated automatically injected url property on top level pages to using withRouter',
    value: 'url-to-withrouter',
  },
  {
    name: 'cra-to-next (experimental): automatically migrates a Create React App project to Next.js',
    value: 'cra-to-next',
  },
  {
    name: 'new-link: Ensures your <Link> usage is backwards compatible.',
    value: 'new-link',
  },
  {
    name: 'next-og-import: Transforms imports from `next/server` to `next/og` for usage of Dynamic OG Image Generation.',
    value: 'next-og-import',
  },
  {
    name: 'metadata-to-viewport-export: Migrates certain viewport related metadata from the `metadata` export to a new `viewport` export.',
    value: 'metadata-to-viewport-export',
  },
  {
    name: 'next-image-to-legacy-image: safely migrate Next.js 10, 11, 12 applications importing `next/image` to the renamed `next/legacy/image` import in Next.js 13',
    value: 'next-image-to-legacy-image',
  },
  {
    name: 'next-image-experimental (experimental): dangerously migrates from `next/legacy/image` to the new `next/image` by adding inline styles and removing unused props',
    value: 'next-image-experimental',
  },
  {
    name: 'built-in-next-font: Uninstall `@next/font` and transform imports to `next/font`',
    value: 'built-in-next-font',
  },
]

function expandFilePathsIfNeeded(filesBeforeExpansion) {
  const shouldExpandFiles = filesBeforeExpansion.some((file) =>
    file.includes('*')
  )
  return shouldExpandFiles
    ? globby.sync(filesBeforeExpansion)
    : filesBeforeExpansion
}

export function run() {
  const cli = meow({
    description: 'Codemods for updating Next.js apps.',
    help: `
    Usage
      $ npx @next/codemod <transform> <path> <...options>
        transform    One of the choices from https://github.com/vercel/next.js/tree/canary/packages/next-codemod
        path         Files or directory to transform. Can be a glob like pages/**.js
    Options
      --force            Bypass Git safety checks and forcibly run codemods
      --dry              Dry run (no changes are made to files)
      --print            Print transformed files to your terminal
      --jscodeshift  (Advanced) Pass options directly to jscodeshift
    `,
    flags: {
      boolean: ['force', 'dry', 'print', 'help'],
      string: ['_'],
      alias: {
        h: 'help',
      },
    },
  } as meow.Options<meow.AnyFlags>)

  if (!cli.flags.dry) {
    checkGitStatus(cli.flags.force)
  }

  if (
    cli.input[0] &&
    !TRANSFORMER_INQUIRER_CHOICES.find((x) => x.value === cli.input[0])
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
        when: !cli.input[1],
        default: '.',
        // validate: () =>
        filter: (files) => files.trim(),
      },
      {
        type: 'list',
        name: 'transformer',
        message: 'Which transform would you like to apply?',
        when: !cli.input[0],
        pageSize: TRANSFORMER_INQUIRER_CHOICES.length,
        choices: TRANSFORMER_INQUIRER_CHOICES,
      },
    ])
    .then((answers) => {
      const { files, transformer } = answers

      const filesBeforeExpansion = cli.input[1] || files
      const filesExpanded = expandFilePathsIfNeeded([filesBeforeExpansion])

      const selectedTransformer = cli.input[0] || transformer

      if (!filesExpanded.length) {
        console.log(`No files found matching ${filesBeforeExpansion.join(' ')}`)
        return null
      }

      return runTransform({
        files: filesExpanded,
        flags: cli.flags,
        transformer: selectedTransformer,
      })
    })
}
