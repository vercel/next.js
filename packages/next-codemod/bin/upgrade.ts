import prompts from 'prompts'
import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { compareVersions } from 'compare-versions'
import chalk from 'chalk'
import { availableCodemods } from '../lib/codemods'
import { getPkgManager, installPackages } from '../lib/handle-package'
import { runTransform } from './transform'

type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

/**
 * @param query
 * @example loadHighestNPMVersionMatching("react@^18.3.0 || ^19.0.0") === Promise<"19.0.0">
 */
async function loadHighestNPMVersionMatching(query: string) {
  const versionsJSON = execSync(
    `npm --silent view "${query}" --json --field version`,
    { encoding: 'utf-8' }
  )
  const versions = JSON.parse(versionsJSON)
  if (versions.length < 1) {
    throw new Error(
      `Found no React versions matching "${query}". This is a bug in the upgrade tool.`
    )
  }

  return versions[versions.length - 1]
}

export async function runUpgrade(
  revision: string | undefined,
  options: { verbose: boolean }
): Promise<void> {
  const { verbose } = options
  const appPackageJsonPath = path.resolve(process.cwd(), 'package.json')
  let appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8'))

  let targetNextPackageJson: {
    version: string
    peerDependencies: Record<string, string>
  }

  const res = await fetch(`https://registry.npmjs.org/next/${revision}`)
  if (res.status === 200) {
    targetNextPackageJson = await res.json()
  } else {
    throw new Error(
      `${chalk.yellow(`next@${revision}`)} does not exist. Check available versions at ${chalk.underline('https://www.npmjs.com/package/next?activeTab=versions')}.`
    )
  }

  const installedNextVersion = getInstalledNextVersion()

  const targetNextVersion = targetNextPackageJson.version

  // We're resolving a specific version here to avoid including "ugly" version queries
  // in the manifest.
  // E.g. in peerDependencies we could have `^18.2.0 || ^19.0.0 || 20.0.0-canary`
  // If we'd just `npm add` that, the manifest would read the same version query.
  // This is basically a `npm --save-exact react@$versionQuery` that works for every package manager.
  const [
    targetReactVersion,
    targetReactTypesVersion,
    targetReactDOMTypesVersion,
  ] = await Promise.all([
    loadHighestNPMVersionMatching(
      `react@${targetNextPackageJson.peerDependencies['react']}`
    ),
    loadHighestNPMVersionMatching(
      `@types/react@${targetNextPackageJson.peerDependencies['react']}`
    ),
    loadHighestNPMVersionMatching(
      `@types/react-dom@${targetNextPackageJson.peerDependencies['react']}`
    ),
  ])

  if (compareVersions(targetNextVersion, '15.0.0-canary') >= 0) {
    await suggestTurbopack(appPackageJson)
  }

  const codemods = await suggestCodemods(
    installedNextVersion,
    targetNextVersion
  )

  fs.writeFileSync(appPackageJsonPath, JSON.stringify(appPackageJson, null, 2))

  const packageManager: PackageManager = getPkgManager(process.cwd())
  const nextDependency = `next@${targetNextVersion}`
  const reactDependencies = [
    `react@${targetReactVersion}`,
    `react-dom@${targetReactVersion}`,
  ]
  if (
    targetReactVersion.startsWith('19.0.0-canary') ||
    targetReactVersion.startsWith('19.0.0-beta') ||
    targetReactVersion.startsWith('19.0.0-rc')
  ) {
    reactDependencies.push(`@types/react@npm:types-react@rc`)
    reactDependencies.push(`@types/react-dom@npm:types-react-dom@rc`)
  } else {
    reactDependencies.push(`@types/react@${targetReactTypesVersion}`)
    reactDependencies.push(`@types/react-dom@${targetReactDOMTypesVersion}`)
  }

  console.log(
    `Upgrading your project to ${chalk.blue('Next.js ' + targetNextVersion)}...\n`
  )

  installPackages([nextDependency, ...reactDependencies], {
    packageManager,
    silent: !verbose,
  })

  for (const codemod of codemods) {
    await runTransform(codemod, process.cwd(), { force: true })
  }

  console.log(
    `\n${chalk.green('✔')} Your Next.js project has been upgraded successfully. ${chalk.bold('Time to ship! 🚢')}`
  )
}

function getInstalledNextVersion(): string {
  try {
    return require(
      require.resolve('next/package.json', {
        paths: [process.cwd()],
      })
    ).version
  } catch (error) {
    throw new Error(
      `Failed to get the installed Next.js version at "${process.cwd()}".\nIf you're using a monorepo, please run this command from the Next.js app directory.`,
      {
        cause: error,
      }
    )
  }
}

/*
 * Heuristics are used to determine whether to Turbopack is enabled or not and
 * to determine how to update the dev script.
 *
 * 1. If the dev script contains `--turbo` option, we assume that Turbopack is
 *    already enabled.
 * 2. If the dev script contains the string `next dev`, we replace it to
 *    `next dev --turbo`.
 * 3. Otherwise, we ask the user to manually add `--turbo` to their dev command,
 *    showing the current dev command as the initial value.
 */
async function suggestTurbopack(packageJson: any): Promise<void> {
  const devScript = packageJson.scripts['dev']
  if (devScript.includes('--turbo')) return

  const responseTurbopack = await prompts(
    {
      type: 'confirm',
      name: 'enable',
      message: 'Turbopack is now the stable default for dev mode. Enable it?',
      initial: true,
    },
    {
      onCancel: () => {
        process.exit(0)
      },
    }
  )

  if (!responseTurbopack.enable) {
    return
  }

  if (devScript.includes('next dev')) {
    packageJson.scripts['dev'] = devScript.replace(
      'next dev',
      'next dev --turbo'
    )
    return
  }

  const responseCustomDevScript = await prompts({
    type: 'text',
    name: 'customDevScript',
    message: 'Please add `--turbo` to your dev command:',
    initial: devScript,
  })

  packageJson.scripts['dev'] =
    responseCustomDevScript.customDevScript || devScript
}

async function suggestCodemods(
  initialNextVersion: string,
  targetNextVersion: string
): Promise<string[]> {
  const initialVersionIndex = availableCodemods.findIndex(
    (versionCodemods) =>
      compareVersions(versionCodemods.version, initialNextVersion) > 0
  )
  if (initialVersionIndex === -1) {
    return []
  }

  let targetVersionIndex = availableCodemods.findIndex(
    (versionCodemods) =>
      compareVersions(versionCodemods.version, targetNextVersion) > 0
  )
  if (targetVersionIndex === -1) {
    targetVersionIndex = availableCodemods.length
  }

  const relevantCodemods = availableCodemods
    .slice(initialVersionIndex, targetVersionIndex)
    .flatMap((versionCodemods) => versionCodemods.codemods)

  if (relevantCodemods.length === 0) {
    return []
  }

  const { codemods } = await prompts(
    {
      type: 'multiselect',
      name: 'codemods',
      message: `\nThe following ${chalk.blue('codemods')} are recommended for your upgrade. Would you like to apply them?`,
      choices: relevantCodemods.map((codemod) => {
        return {
          title: `${codemod.title} ${chalk.grey(`(${codemod.value})`)}`,
          value: codemod.value,
          selected: true,
        }
      }),
    },
    {
      onCancel: () => {
        process.exit(0)
      },
    }
  )

  return codemods
}
