import prompts from 'prompts'
import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { compareVersions } from 'compare-versions'
import pc from 'picocolors'
import { getPkgManager, installPackages } from '../lib/handle-package'
import { runTransform } from './transform'
import { onCancel, TRANSFORMER_INQUIRER_CHOICES } from '../lib/utils'

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
  const versionOrVersions = JSON.parse(versionsJSON)
  if (versionOrVersions.length < 1) {
    console.error(
      `${pc.red('⨯')} Found no React versions matching "${query}". This is a bug in the upgrade tool.`
    )
    process.exit(1)
  }
  // npm-view returns an array if there are multiple versions matching the query.
  if (Array.isArray(versionOrVersions)) {
    // The last entry will be the latest version published.
    return versionOrVersions[versionOrVersions.length - 1]
  }
  return versionOrVersions
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
  }
  const validRevision =
    targetNextPackageJson !== null &&
    typeof targetNextPackageJson === 'object' &&
    'version' in targetNextPackageJson &&
    'peerDependencies' in targetNextPackageJson
  if (!validRevision) {
    console.error(
      `${pc.red('⨯')} ${pc.yellow(`next@${revision}`)} does not exist. Make sure you entered a valid Next.js version or dist-tag. Check available versions at ${pc.underline('https://www.npmjs.com/package/next?activeTab=versions')}.`
    )
    process.exit(1)
  }

  const installedNextVersion = getInstalledNextVersion()

  const targetNextVersion = targetNextPackageJson.version

  // We're resolving a specific version here to avoid including "ugly" version queries
  // in the manifest.
  // E.g. in peerDependencies we could have `^18.2.0 || ^19.0.0 || 20.0.0-canary`
  // If we'd just `npm add` that, the manifest would read the same version query.
  // This is basically a `npm --save-exact react@$versionQuery` that works for every package manager.
  const targetReactVersion = await loadHighestNPMVersionMatching(
    `react@${targetNextPackageJson.peerDependencies['react']}`
  )

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
    const [targetReactTypesVersion, targetReactDOMTypesVersion] =
      await Promise.all([
        loadHighestNPMVersionMatching(
          `@types/react@${targetNextPackageJson.peerDependencies['react']}`
        ),
        loadHighestNPMVersionMatching(
          `@types/react-dom@${targetNextPackageJson.peerDependencies['react']}`
        ),
      ])
    reactDependencies.push(`@types/react@${targetReactTypesVersion}`)
    reactDependencies.push(`@types/react-dom@${targetReactDOMTypesVersion}`)
  }

  console.log(
    `Upgrading your project to ${pc.blue('Next.js ' + targetNextVersion)}...\n`
  )

  installPackages([nextDependency, ...reactDependencies], {
    packageManager,
    silent: !verbose,
  })

  for (const codemod of codemods) {
    await runTransform(codemod, process.cwd(), { force: true })
  }

  console.log(
    `\n${pc.green('✔')} Your Next.js project has been upgraded successfully. ${pc.bold('Time to ship! 🚢')}`
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
    console.error(
      `${pc.red('⨯')} Failed to get the installed Next.js version at "${process.cwd()}".\nIf you're using a monorepo, please run this command from the Next.js app directory.`
    )
    process.exit(1)
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
  const devScript: string = packageJson.scripts['dev']
  if (devScript.includes('--turbo')) return

  const responseTurbopack = await prompts(
    {
      type: 'confirm',
      name: 'enable',
      message: 'Enable Turbopack for next dev?',
      initial: true,
    },
    { onCancel }
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

  console.log(
    `${pc.yellow('⚠')} Could not find "${pc.bold('next dev')}" in your dev script.`
  )

  const responseCustomDevScript = await prompts(
    {
      type: 'text',
      name: 'customDevScript',
      message: 'Please manually add "--turbo" to your dev command.',
      initial: devScript,
    },
    { onCancel }
  )

  packageJson.scripts['dev'] =
    responseCustomDevScript.customDevScript || devScript
}

async function suggestCodemods(
  initialNextVersion: string,
  targetNextVersion: string
): Promise<string[]> {
  const initialVersionIndex = TRANSFORMER_INQUIRER_CHOICES.findIndex(
    (versionCodemods) =>
      compareVersions(versionCodemods.version, initialNextVersion) > 0
  )
  if (initialVersionIndex === -1) {
    return []
  }

  let targetVersionIndex = TRANSFORMER_INQUIRER_CHOICES.findIndex(
    (versionCodemods) =>
      compareVersions(versionCodemods.version, targetNextVersion) > 0
  )
  if (targetVersionIndex === -1) {
    targetVersionIndex = TRANSFORMER_INQUIRER_CHOICES.length
  }

  const relevantCodemods = TRANSFORMER_INQUIRER_CHOICES.slice(
    initialVersionIndex,
    targetVersionIndex
  )

  if (relevantCodemods.length === 0) {
    return []
  }

  const { codemods } = await prompts(
    {
      type: 'multiselect',
      name: 'codemods',
      message: `The following ${pc.blue('codemods')} are recommended for your upgrade. Select the ones to apply.`,
      choices: relevantCodemods.reverse().map(({ title, value, version }) => {
        return {
          title: `(v${version}) ${value}`,
          description: title,
          value,
          selected: true,
        }
      }),
    },
    { onCancel }
  )

  return codemods
}
