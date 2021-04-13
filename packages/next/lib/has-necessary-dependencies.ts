import chalk from 'chalk'
import path from 'path'
import { fileExists } from './file-exists'
import { getOxfordCommaList } from './oxford-comma-list'

import { FatalTypeScriptError } from './typescript/FatalTypeScriptError'
import { ESLintFatalError } from './eslint/ESLintFatalError'

const requiredTSPackages = [
  { file: 'typescript', pkg: 'typescript' },
  { file: '@types/react/index.d.ts', pkg: '@types/react' },
  { file: '@types/node/index.d.ts', pkg: '@types/node' },
]

const requiredLintPackages = [
  { file: '', pkg: 'eslint' },
  { file: '', pkg: '@babel/core' },
  { file: '', pkg: '@babel/eslint-parser' },
  { file: '', pkg: 'eslint-config-next' },
  { file: '', pkg: '@next/eslint-plugin-next' },
  { file: '', pkg: 'eslint-plugin-react' },
  { file: '', pkg: 'eslint-plugin-react-hooks' },
  { file: '', pkg: 'eslint-plugin-import' },
]

const tsParsers = [{ file: '', pkg: '@typescript-eslint/parser' }]

export type NecessaryDependencies = {
  resolved: string
}

export async function hasNecessaryDependencies(
  baseDir: string,
  isUsingTS: boolean,
  eslintrcFile: string | null = null
): Promise<NecessaryDependencies> {
  let resolutions = new Map<string, string>()
  let requiredPackages: {
    file: string
    pkg: string
  }[]

  // If .eslintrc file is being passed, check for lint dependencies. Otherwise, this is during the typescript setup so check for ts dependencies
  const checkESLintDeps = eslintrcFile !== null

  if (checkESLintDeps) {
    requiredPackages = isUsingTS
      ? requiredLintPackages.concat(tsParsers)
      : requiredLintPackages
  } else {
    requiredPackages = requiredTSPackages
  }

  const missingPackages = requiredPackages.filter((p) => {
    try {
      resolutions.set(
        p.pkg,
        require.resolve(p.file || p.pkg, { paths: [baseDir] })
      )
      return false
    } catch (_) {
      return true
    }
  })

  if (missingPackages.length < 1) {
    return {
      resolved: checkESLintDeps
        ? resolutions.get('eslint')!
        : resolutions.get('typescript')!,
    }
  }

  const packagesHuman = getOxfordCommaList(missingPackages.map((p) => p.pkg))

  const yarnLockFile = path.join(baseDir, 'yarn.lock')

  if (checkESLintDeps) {
    const removalLocation = eslintrcFile
      ? chalk.cyan(path.basename(eslintrcFile)) + ' file from your application'
      : chalk.cyan('eslintConfig') + ' field from your package.json file'

    throw new ESLintFatalError(
      chalk.bold.red(
        `It looks like you're trying to use ESLint but do not have the following required package(s) installed:`
      ) +
        `\n\n\t` +
        getOxfordCommaList(missingPackages.map((p) => p.pkg)) +
        '\n\n' +
        chalk.bold(`Please install all required dependencies by running:`) +
        '\n\n' +
        `\t${chalk.bold.cyan(
          'npx install-peerdeps --dev eslint-config-next'
        )}` +
        '\n\n' +
        chalk.bold(
          `If you are not trying to use ESLint, please remove the ${removalLocation}.\n\nLearn more: https://nextjs.org/docs/basic-features/eslint\n`
        )
    )
  } else {
    const packagesCli = missingPackages.map((p) => p.pkg).join(' ')
    const isYarn = await fileExists(yarnLockFile).catch(() => false)

    throw new FatalTypeScriptError(
      chalk.bold.red(
        `It looks like you're trying to use TypeScript but do not have the required package(s) installed.`
      ) +
        '\n\n' +
        chalk.bold(`Please install ${chalk.bold(packagesHuman)} by running:`) +
        '\n\n' +
        `\t${chalk.bold.cyan(
          (isYarn ? 'yarn add --dev' : 'npm install --save-dev') +
            ' ' +
            packagesCli
        )}` +
        '\n\n' +
        chalk.bold(
          'If you are not trying to use TypeScript, please remove the ' +
            chalk.cyan('tsconfig.json') +
            ' file from your package root (and any TypeScript files in your pages directory).'
        ) +
        '\n'
    )
  }
}
