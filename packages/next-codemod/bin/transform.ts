import execa from 'execa'
import globby from 'globby'
import prompts from 'prompts'
import stripAnsi from 'strip-ansi'
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

  if (transformer === 'next-request-geo-ip') {
    const { isAppDeployedToVercel } = await prompts(
      {
        type: 'confirm',
        name: 'isAppDeployedToVercel',
        message:
          'Is your app deployed to Vercel? (Required to apply the selected codemod)',
        initial: true,
      },
      { onCancel }
    )
    if (!isAppDeployedToVercel) {
      console.log(
        'Skipping codemod "next-request-geo-ip" as your app is not deployed to Vercel.'
      )
      return
    }
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

  const execaChildProcess = execa(jscodeshiftExecutable, args, {
    // include ANSI color codes
    // Note: execa merges env with existing env by default.
    env: process.stdout.isTTY ? { FORCE_COLOR: 'true' } : {},
  })

  // "\n" + "a\n" + "b\n"
  let lastThreeLineBreaks = ''

  if (execaChildProcess.stdout) {
    execaChildProcess.stdout.pipe(process.stdout)
    execaChildProcess.stderr.pipe(process.stderr)

    // The last two lines contain the successful transformation count as "N ok".
    // To save memory, we "slide the window" to keep only the last three line breaks.
    // We save three line breaks because the EOL is always "\n".
    execaChildProcess.stdout.on('data', (chunk) => {
      lastThreeLineBreaks += chunk.toString('utf-8')

      let cutoff = lastThreeLineBreaks.length

      // Note: the stdout ends with "\n".
      // "foo\n" + "bar\n" + "baz\n" -> "\nbar\nbaz\n"
      // "\n" + "foo\n" + "bar\n" -> "\nfoo\nbar\n"

      for (let i = 0; i < 3; i++) {
        cutoff = lastThreeLineBreaks.lastIndexOf('\n', cutoff) - 1
      }

      if (cutoff > 0 && cutoff < lastThreeLineBreaks.length) {
        lastThreeLineBreaks = lastThreeLineBreaks.slice(cutoff + 1)
      }
    })
  }

  try {
    const result = await execaChildProcess

    if (result.failed) {
      throw new Error(`jscodeshift exited with code ${result.exitCode}`)
    }
  } catch (error) {
    throw error
  }

  // With ANSI color codes, it will be "\x1B[39m\x1B[32m0 ok".
  // Without, it will be "0 ok".
  const targetOkLine = lastThreeLineBreaks.split('\n').at(-3)

  if (!targetOkLine.endsWith('ok')) {
    throw new Error(
      `Failed to parse the successful transformation count "${targetOkLine}". This is a bug in the codemod tool.`
    )
  }

  const stripped = stripAnsi(targetOkLine)
  // "N ok" -> "N"
  const parsedNum = parseInt(stripped.split(' ')[0], 10)
  const hasChanges = parsedNum > 0

  if (!dry && transformer === 'built-in-next-font' && hasChanges) {
    const { uninstallNextFont } = await prompts(
      {
        type: 'confirm',
        name: 'uninstallNextFont',
        message:
          '`built-in-next-font` should have removed all usages of `@next/font`. Do you want to uninstall `@next/font`?',
        initial: true,
      },
      { onCancel }
    )

    if (uninstallNextFont) {
      console.log('Uninstalling `@next/font`')
      uninstallPackage('@next/font')
    }
  }

  // When has changes, it requires `@vercel/functions`, so skip prompt.
  if (!dry && transformer === 'next-request-geo-ip' && hasChanges) {
    console.log(
      'Installing `@vercel/functions` because the `next-request-geo-ip` made changes.'
    )
    installPackages(['@vercel/functions'])
  }
}
