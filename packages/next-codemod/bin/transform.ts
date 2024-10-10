import execa from 'execa'
import globby from 'globby'
import prompts from 'prompts'
import { join } from 'node:path'
import { installPackages, uninstallPackage } from '../lib/handle-package'
import {
  checkGitStatus,
  onCancel,
  TRANSFORMER_INQUIRER_CHOICES,
} from '../lib/utils'

function expandFilePathsIfNeeded(filesBeforeExpansion) {
  const shouldExpandFiles = filesBeforeExpansion.some((file) =>
    file.includes('*')
  )
  return shouldExpandFiles
    ? globby.sync(filesBeforeExpansion)
    : filesBeforeExpansion
}

export const jscodeshiftExecutable = require.resolve('.bin/jscodeshift')
export const transformerDirectory = join(__dirname, '../', 'transforms')

export async function runTransform(
  transform: string,
  path: string,
  options: any
) {
  let transformer = transform
  let directory = path

  if (!options.dry) {
    checkGitStatus(options.force)
  }

  if (
    transform &&
    !TRANSFORMER_INQUIRER_CHOICES.find((x) => x.value === transform)
  ) {
    console.error('Invalid transform choice, pick one of:')
    console.error(
      TRANSFORMER_INQUIRER_CHOICES.map((x) => '- ' + x.value).join('\n')
    )
    process.exit(1)
  }

  if (!path) {
    const res = await prompts(
      {
        type: 'text',
        name: 'path',
        message: 'On which files or directory should the codemods be applied?',
        initial: '.',
      },
      { onCancel }
    )

    directory = res.path
  }
  if (!transform) {
    const res = await prompts(
      {
        type: 'select',
        name: 'transformer',
        message: 'Which transform would you like to apply?',
        choices: TRANSFORMER_INQUIRER_CHOICES.reverse().map(
          ({ title, value, version }) => {
            return {
              title: `(v${version}) ${value}`,
              description: title,
              value,
            }
          }
        ),
      },
      { onCancel }
    )

    transformer = res.transformer
  }

  const filesExpanded = expandFilePathsIfNeeded([directory])

  if (!filesExpanded.length) {
    console.log(`No files found matching "${directory}"`)
    return null
  }

  const transformerPath = join(transformerDirectory, `${transformer}.js`)

  if (transformer === 'cra-to-next') {
    // cra-to-next transform doesn't use jscodeshift directly
    return require(transformerPath).default(filesExpanded, options)
  }

  let args = []

  const { dry, print, runInBand, jscodeshift, verbose } = options

  if (dry) {
    args.push('--dry')
  }
  if (print) {
    args.push('--print')
  }
  if (runInBand) {
    args.push('--run-in-band')
  }
  if (verbose) {
    args.push('--verbose=2')
  }
  args.push('--no-babel')

  args.push('--ignore-pattern=**/node_modules/**')
  args.push('--ignore-pattern=**/.next/**')

  args.push('--extensions=tsx,ts,jsx,js')

  args = args.concat(['--transform', transformerPath])

  if (jscodeshift) {
    args = args.concat(jscodeshift)
  }

  args = args.concat(filesExpanded)

  console.log(`Executing command: jscodeshift ${args.join(' ')}`)

  const result = execa.sync(jscodeshiftExecutable, args, {
    stdio: 'inherit',
    stripFinalNewline: false,
  })

  if (result.failed) {
    throw new Error(`jscodeshift exited with code ${result.exitCode}`)
  }

  if (!dry && transformer === 'built-in-next-font') {
    const { uninstallNextFont } = await prompts({
      type: 'confirm',
      name: 'uninstallNextFont',
      message: 'Do you want to uninstall `@next/font`?',
      initial: true,
    })

    if (uninstallNextFont) {
      console.log('Uninstalling `@next/font`')
      uninstallPackage('@next/font')
    }
  }

  if (!dry && transformer === 'next-request-geo-ip') {
    const { installVercelFunctions } = await prompts({
      type: 'confirm',
      name: 'installVercelFunctions',
      message: 'Do you want to install `@vercel/functions`?',
      initial: true,
    })

    if (installVercelFunctions) {
      console.log('Installing `@vercel/functions`...')
      installPackages(['@vercel/functions'])
    }
  }
}
