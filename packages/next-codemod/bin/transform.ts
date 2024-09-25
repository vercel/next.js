import execa from 'execa'
import globby from 'globby'
import prompts from 'prompts'
import { join } from 'node:path'
import { installPackage, uninstallPackage } from '../lib/handle-package'
import { checkGitStatus, CODEMOD_CHOICES } from '../lib/utils'

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
  codemod: string,
  source: string,
  options: any
) {
  const { dry, print, runInBand, jscodeshift, force } = options

  if (!dry) {
    checkGitStatus(force)
  }

  if (codemod && !CODEMOD_CHOICES.find((x) => x.value === codemod)) {
    console.error('Invalid transform choice, pick one of:')
    console.error(CODEMOD_CHOICES.map((x) => '- ' + x.value).join('\n'))
    process.exit(1)
  }

  if (!source) {
    const res = await prompts({
      type: 'text',
      name: 'source',
      message: 'On which files or directory should the codemods be applied?',
      default: '.',
    })

    source = res.source
  }
  if (!codemod) {
    const res = await prompts({
      type: 'select',
      name: 'codemod',
      message: 'Which transform would you like to apply?',
      choices: CODEMOD_CHOICES,
    })

    codemod = res.codemod
  }

  const filesExpanded = expandFilePathsIfNeeded([source])

  if (!filesExpanded.length) {
    console.log(`No files found matching "${source}"`)
    return null
  }

  const transformerPath = join(transformerDirectory, `${codemod}.js`)

  if (codemod === 'cra-to-next') {
    // cra-to-next transform doesn't use jscodeshift directly
    return require(transformerPath).default(filesExpanded, options)
  }

  let args = []

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

  if (!dry && codemod === 'built-in-next-font') {
    console.log('Uninstalling `@next/font`')
    try {
      uninstallPackage('@next/font')
    } catch {
      console.error(
        "Couldn't uninstall `@next/font`, please uninstall it manually"
      )
    }
  }

  if (!dry && codemod === 'next-request-geo-ip') {
    console.log('Installing `@vercel/functions`...')
    installPackage('@vercel/functions')
  }
}
