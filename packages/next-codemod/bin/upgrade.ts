import prompts from 'prompts'
import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { compareVersions } from 'compare-versions'
import chalk from 'chalk'
import { availableCodemods } from '../lib/codemods'
import { getPkgManager, installPackages } from '../lib/handle-package'
import { runTransform } from './transform'

type StandardVersionSpecifier = 'canary' | 'rc' | 'latest'
type CustomVersionSpecifier = string
type VersionSpecifier = StandardVersionSpecifier | CustomVersionSpecifier
type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

interface Response {
  version: StandardVersionSpecifier
}

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

  await detectWorkspace(appPackageJson)

  let targetNextPackageJson: {
    version: string
    peerDependencies: Record<string, string>
  }
  let targetVersionSpecifier: VersionSpecifier = ''

  if (revision !== undefined) {
    const res = await fetch(`https://registry.npmjs.org/next/${revision}`)
    if (res.status === 200) {
      targetNextPackageJson = await res.json()
      targetVersionSpecifier = targetNextPackageJson.version
    } else {
      console.error(
        `${chalk.yellow(`next@${revision}`)} does not exist. Check available versions at ${chalk.underline('https://www.npmjs.com/package/next?activeTab=versions')}, or choose one from below\n`
      )
    }
  }

  const installedNextVersion = await getInstalledNextVersion()

  if (!targetNextPackageJson) {
    let nextPackageJson: { [key: string]: any } = {}
    try {
      const resCanary = await fetch(`https://registry.npmjs.org/next/canary`)
      nextPackageJson['canary'] = await resCanary.json()

      const resRc = await fetch(`https://registry.npmjs.org/next/rc`)
      nextPackageJson['rc'] = await resRc.json()

      const resLatest = await fetch(`https://registry.npmjs.org/next/latest`)
      nextPackageJson['latest'] = await resLatest.json()
    } catch (error) {
      console.error('Failed to fetch versions from npm registry.')
      return
    }

    let showRc = true
    if (nextPackageJson['latest'].version && nextPackageJson['rc'].version) {
      showRc =
        compareVersions(
          nextPackageJson['rc'].version,
          nextPackageJson['latest'].version
        ) === 1
    }

    const choices = [
      {
        title: 'Canary',
        value: 'canary',
        description: `Experimental version with latest features (${nextPackageJson['canary'].version})`,
      },
    ]
    if (showRc) {
      choices.push({
        title: 'Release Candidate',
        value: 'rc',
        description: `Pre-release version for final testing (${nextPackageJson['rc'].version})`,
      })
    }
    choices.push({
      title: 'Stable',
      value: 'latest',
      description: `Production-ready release (${nextPackageJson['latest'].version})`,
    })

    if (installedNextVersion) {
      console.log(
        `You are currently using ${chalk.blue('Next.js ' + installedNextVersion)}`
      )
    }

    const initialVersionSpecifierIdx = await getVersionSpecifierIdx(
      installedNextVersion,
      showRc
    )

    const response: Response = await prompts(
      {
        type: 'select',
        name: 'version',
        message: 'What Next.js version do you want to upgrade to?',
        choices: choices,
        initial: initialVersionSpecifierIdx,
      },
      { onCancel: () => process.exit(0) }
    )

    targetNextPackageJson = nextPackageJson[response.version]
    targetVersionSpecifier = response.version
  }

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
    `Upgrading your project to ${chalk.blue('Next.js ' + targetVersionSpecifier)}...\n`
  )

  installPackages([nextDependency, ...reactDependencies], {
    packageManager,
    silent: !verbose,
  })

  await suggestCodemods(installedNextVersion, targetNextVersion)

  console.log(
    `\n${chalk.green('✔')} Your Next.js project has been upgraded successfully. ${chalk.bold('Time to ship! 🚢')}`
  )
}

async function detectWorkspace(appPackageJson: any): Promise<void> {
  let isWorkspace =
    appPackageJson.workspaces ||
    fs.existsSync(path.resolve(process.cwd(), 'pnpm-workspace.yaml'))

  if (!isWorkspace) return

  console.log(
    `${chalk.red('⚠️')} You seem to be in the root of a monorepo. ${chalk.blue('@next/upgrade')} should be run in a specific app directory within the monorepo.`
  )

  const response = await prompts(
    {
      type: 'confirm',
      name: 'value',
      message: 'Do you still want to continue?',
      initial: false,
    },
    { onCancel: () => process.exit(0) }
  )

  if (!response.value) {
    process.exit(0)
  }
}

async function getInstalledNextVersion(): Promise<string> {
  const installedNextPackageJsonDir = require.resolve('next/package.json', {
    paths: [process.cwd()],
  })
  const installedNextPackageJson = JSON.parse(
    fs.readFileSync(installedNextPackageJsonDir, 'utf8')
  )

  return installedNextPackageJson.version
}

/*
 * Returns the index of the current version's specifier in the
 * array ['canary', 'rc', 'latest'] or ['canary', 'latest']
 */
async function getVersionSpecifierIdx(
  installedNextVersion: string,
  showRc: boolean
): Promise<number> {
  if (installedNextVersion == null) {
    return 0
  }

  if (installedNextVersion.includes('canary')) {
    return 0
  }
  if (installedNextVersion.includes('rc')) {
    return 1
  }
  return showRc ? 2 : 1
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
): Promise<void> {
  const initialVersionIndex = availableCodemods.findIndex(
    (versionCodemods) =>
      compareVersions(versionCodemods.version, initialNextVersion) > 0
  )
  if (initialVersionIndex === -1) {
    return
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
    return
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

  for (const codemod of codemods) {
    await runTransform(codemod, process.cwd(), { force: true })
  }
}
