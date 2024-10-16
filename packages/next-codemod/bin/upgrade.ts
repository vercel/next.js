import prompts from 'prompts'
import fs from 'fs'
import semver from 'semver'
import compareVersions from 'semver/functions/compare'
import { execSync } from 'child_process'
import path from 'path'
import pc from 'picocolors'
import {
  getPkgManager,
  addPackageDependency,
  runInstallation,
} from '../lib/handle-package'
import { runTransform } from './transform'
import { onCancel, TRANSFORMER_INQUIRER_CHOICES } from '../lib/utils'
import { BadInput } from './shared'

type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

const optionalNextjsPackages = [
  'create-next-app',
  'eslint-config-next',
  '@next/bundle-analyzer',
  '@next/codemod',
  '@next/env',
  '@next/eslint-plugin-next',
  '@next/font',
  '@next/mdx',
  '@next/plugin-storybook',
  '@next/polyfill-module',
  '@next/polyfill-nomodule',
  '@next/swc',
  '@next/react-refresh-utils',
  '@next/third-parties',
]

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
    throw new Error(
      `Found no React versions matching "${query}". This is a bug in the upgrade tool.`
    )
  }
  // npm-view returns an array if there are multiple versions matching the query.
  if (Array.isArray(versionOrVersions)) {
    // The last entry will be the latest version published.
    return versionOrVersions[versionOrVersions.length - 1]
  }
  return versionOrVersions
}

function endMessage() {
  console.log()
  console.log(
    pc.white(
      pc.bold(
        `Please review the local changes and read the Next.js 15 migration guide to complete the migration.`
      )
    )
  )
  console.log(
    pc.underline(
      'https://nextjs.org/docs/canary/app/building-your-application/upgrading/version-15'
    )
  )
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
    throw new BadInput(
      `Invalid revision provided: "${revision}". Please provide a valid Next.js version or dist-tag (e.g. "latest", "canary", "rc", or "15.0.0").\nCheck available versions at https://www.npmjs.com/package/next?activeTab=versions.`
    )
  }

  const installedNextVersion = getInstalledNextVersion()

  const targetNextVersion = targetNextPackageJson.version

  if (compareVersions(installedNextVersion, targetNextVersion) === 0) {
    console.log(
      `${pc.green('✓')} Current Next.js version is already on the target version "v${targetNextVersion}".`
    )
    endMessage()
    return
  }
  if (compareVersions(installedNextVersion, targetNextVersion) > 0) {
    console.log(
      `${pc.green('✓')} Current Next.js version is higher than the target version "v${targetNextVersion}".`
    )
    endMessage()
    return
  }

  const installedReactVersion = getInstalledReactVersion()
  // Align the prefix spaces
  console.log(`  Detected installed versions:`)
  console.log(`  - React: v${installedReactVersion}`)
  console.log(`  - Next.js: v${installedNextVersion}`)
  let shouldStayOnReact18 = false
  if (
    // From release v14.3.0-canary.45, Next.js expects the React version to be 19.0.0-beta.0
    // If the user is on a version higher than this but is still on React 18, we ask them
    // if they still want to stay on React 18 after the upgrade.
    // IF THE USER USES APP ROUTER, we expect them to upgrade React to > 19.0.0-beta.0,
    // we should only let the user stay on React 18 if they are using pure Pages Router.
    // x-ref(PR): https://github.com/vercel/next.js/pull/65058
    // x-ref(release): https://github.com/vercel/next.js/releases/tag/v14.3.0-canary.45
    compareVersions(installedNextVersion, '14.3.0-canary.45') >= 0 &&
    installedReactVersion.startsWith('18')
  ) {
    const shouldStayOnReact18Res = await prompts(
      {
        type: 'confirm',
        name: 'shouldStayOnReact18',
        message: `Are you using ${pc.underline('only the Pages Router')} (no App Router) and prefer to stay on React 18?`,
        initial: false,
        active: 'Yes',
        inactive: 'No',
      },
      { onCancel }
    )
    shouldStayOnReact18 = shouldStayOnReact18Res.shouldStayOnReact18
  }

  // We're resolving a specific version here to avoid including "ugly" version queries
  // in the manifest.
  // E.g. in peerDependencies we could have `^18.2.0 || ^19.0.0 || 20.0.0-canary`
  // If we'd just `npm add` that, the manifest would read the same version query.
  // This is basically a `npm --save-exact react@$versionQuery` that works for every package manager.
  const targetReactVersion = shouldStayOnReact18
    ? '18.3.1'
    : await loadHighestNPMVersionMatching(
        `react@${targetNextPackageJson.peerDependencies['react']}`
      )

  if (compareVersions(targetNextVersion, '15.0.0-canary') >= 0) {
    await suggestTurbopack(appPackageJson)
  }

  const codemods = await suggestCodemods(
    installedNextVersion,
    targetNextVersion
  )
  const packageManager: PackageManager = getPkgManager(process.cwd())

  let shouldRunReactCodemods = false
  let shouldRunReactTypesCodemods = false
  let execCommand = 'npx'
  // The following React codemods are for React 19
  if (
    !shouldStayOnReact18 &&
    compareVersions(targetReactVersion, '19.0.0-beta.0') >= 0
  ) {
    shouldRunReactCodemods = await suggestReactCodemods()
    shouldRunReactTypesCodemods = await suggestReactTypesCodemods()

    const execCommandMap = {
      yarn: 'yarn dlx',
      pnpm: 'pnpx',
      bun: 'bunx',
      npm: 'npx',
    }
    execCommand = execCommandMap[packageManager]
  }

  fs.writeFileSync(appPackageJsonPath, JSON.stringify(appPackageJson, null, 2))

  const dependenciesToInstall: [string, string][] = []
  const devDependenciesToInstall: [string, string][] = []

  const allDependencies = {
    ...appPackageJson.dependencies,
    ...appPackageJson.devDependencies,
  }

  const versionMapping: Record<string, { version: string; required: boolean }> =
    {
      next: { version: targetNextVersion, required: true },
      react: { version: targetReactVersion, required: true },
      'react-dom': { version: targetReactVersion, required: true },
      'react-is': { version: targetReactVersion, required: false },
    }
  for (const optionalNextjsPackage of optionalNextjsPackages) {
    versionMapping[optionalNextjsPackage] = {
      version: targetNextVersion,
      required: false,
    }
  }

  if (
    targetReactVersion.startsWith('19.0.0-canary') ||
    targetReactVersion.startsWith('19.0.0-beta') ||
    targetReactVersion.startsWith('19.0.0-rc')
  ) {
    const [targetReactTypesVersion, targetReactDOMTypesVersion] =
      await Promise.all([
        loadHighestNPMVersionMatching(`types-react@rc`),
        loadHighestNPMVersionMatching(`types-react-dom@rc`),
      ])
    if (allDependencies['@types/react']) {
      versionMapping['@types/react'] = {
        version: `npm:types-react@${targetReactTypesVersion}`,
        required: false,
      }
    }
    if (allDependencies['@types/react-dom']) {
      versionMapping['@types/react-dom'] = {
        version: `npm:types-react-dom@${targetReactDOMTypesVersion}`,
        required: false,
      }
    }
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

    if (allDependencies['@types/react']) {
      versionMapping['@types/react'] = {
        version: targetReactTypesVersion,
        required: false,
      }
    }
    if (allDependencies['@types/react-dom']) {
      versionMapping['@types/react-dom'] = {
        version: targetReactDOMTypesVersion,
        required: false,
      }
    }
  }

  // Even though we only need those if we alias `@types/react` to types-react,
  // we still do it out of safety due to https://github.com/microsoft/DefinitelyTyped-tools/issues/433.
  const overrides: Record<string, string> = {}

  if (allDependencies['@types/react']) {
    overrides['@types/react'] = versionMapping['@types/react'].version
  }
  if (allDependencies['@types/react-dom']) {
    overrides['@types/react-dom'] = versionMapping['@types/react-dom'].version
  }

  writeOverridesField(appPackageJson, packageManager, overrides)

  for (const [packageName, { version, required }] of Object.entries(
    versionMapping
  )) {
    if (appPackageJson.devDependencies?.[packageName]) {
      devDependenciesToInstall.push([packageName, version])
    } else if (required || appPackageJson.dependencies?.[packageName]) {
      dependenciesToInstall.push([packageName, version])
    }
  }

  console.log(
    `Upgrading your project to ${pc.blue('Next.js ' + targetNextVersion)}...\n`
  )

  for (const [dep, version] of dependenciesToInstall) {
    addPackageDependency(appPackageJson, dep, version, false)
  }
  for (const [dep, version] of devDependenciesToInstall) {
    addPackageDependency(appPackageJson, dep, version, true)
  }

  fs.writeFileSync(appPackageJsonPath, JSON.stringify(appPackageJson, null, 2))

  runInstallation(packageManager)

  for (const codemod of codemods) {
    await runTransform(codemod, process.cwd(), { force: true, verbose })
  }

  // To reduce user-side burden of selecting which codemods to run as it needs additional
  // understanding of the codemods, we run all of the applicable codemods.
  if (shouldRunReactCodemods) {
    // https://react.dev/blog/2024/04/25/react-19-upgrade-guide#run-all-react-19-codemods
    execSync(
      // `--no-interactive` skips the interactive prompt that asks for confirmation
      // https://github.com/codemod-com/codemod/blob/c0cf00d13161a0ec0965b6cc6bc5d54076839cc8/apps/cli/src/flags.ts#L160
      `${execCommand} codemod@latest react/19/migration-recipe --no-interactive`,
      { stdio: 'inherit' }
    )
  }

  if (shouldRunReactTypesCodemods) {
    // https://react.dev/blog/2024/04/25/react-19-upgrade-guide#typescript-changes
    // `--yes` skips prompts and applies all codemods automatically
    // https://github.com/eps1lon/types-react-codemod/blob/8463103233d6b70aad3cd6bee1814001eae51b28/README.md?plain=1#L52
    execSync(`${execCommand} types-react-codemod@latest --yes preset-19 .`, {
      stdio: 'inherit',
    })
  }
  console.log() // new line
  if (codemods.length > 0) {
    console.log(`${pc.green('✔')} Codemods have been applied successfully.`)
  }
  endMessage()
}

function getInstalledNextVersion(): string {
  try {
    return require(
      require.resolve('next/package.json', {
        paths: [process.cwd()],
      })
    ).version
  } catch (error) {
    throw new BadInput(
      `Failed to get the installed Next.js version at "${process.cwd()}".\nIf you're using a monorepo, please run this command from the Next.js app directory.`,
      {
        cause: error,
      }
    )
  }
}

function getInstalledReactVersion(): string {
  try {
    return require(
      require.resolve('react/package.json', {
        paths: [process.cwd()],
      })
    ).version
  } catch (error) {
    throw new BadInput(
      `Failed to detect the installed React version in "${process.cwd()}".\nIf you're working in a monorepo, please run this command from the Next.js app directory.`,
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
  // Here we suggest pre-released codemods by their "stable" version.
  // It is because if we suggest by the version range (installed ~ target),
  // pre-released codemods for the target version are not suggested when upgrading.

  // Let's say we have a codemod for v15.0.0-canary.x, and we're upgrading from
  // v15.x -> v15.x. Our initial version is higher than the codemod's version,
  // so the codemod will not be suggested.

  // This is not ideal as the codemods for pre-releases are also targeting the major version.
  // Also, when the user attempts to run the upgrade command twice, and have installed the
  // target version, the behavior must be idempotent and suggest the codemods including the
  // pre-releases of the target version.
  const initial = semver.parse(initialNextVersion)
  const initialVersionIndex = TRANSFORMER_INQUIRER_CHOICES.findIndex(
    (versionCodemods) => {
      const codemod = semver.parse(versionCodemods.version)
      return (
        compareVersions(
          `${codemod.major}.${codemod.minor}.${codemod.patch}`,
          `${initial.major}.${initial.minor}.${initial.patch}`
        ) >= 0
      )
    }
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

async function suggestReactCodemods(): Promise<boolean> {
  const { runReactCodemod } = await prompts(
    {
      type: 'toggle',
      name: 'runReactCodemod',
      message: 'Would you like to run the React 19 upgrade codemod?',
      initial: true,
      active: 'Yes',
      inactive: 'No',
    },
    { onCancel }
  )

  return runReactCodemod
}

async function suggestReactTypesCodemods(): Promise<boolean> {
  const { runReactTypesCodemod } = await prompts(
    {
      type: 'toggle',
      name: 'runReactTypesCodemod',
      message: 'Would you like to run the React 19 Types upgrade codemod?',
      initial: true,
      active: 'Yes',
      inactive: 'No',
    },
    { onCancel }
  )

  return runReactTypesCodemod
}

function writeOverridesField(
  packageJson: any,
  packageManager: PackageManager,
  overrides: Record<string, string>
) {
  if (packageManager === 'bun' || packageManager === 'npm') {
    if (!packageJson.overrides) {
      packageJson.overrides = {}
    }
    for (const [key, value] of Object.entries(overrides)) {
      packageJson.overrides[key] = value
    }
  } else if (packageManager === 'pnpm') {
    // pnpm supports pnpm.overrides and pnpm.resolutions
    if (packageJson.resolutions) {
      for (const [key, value] of Object.entries(overrides)) {
        packageJson.resolutions[key] = value
      }
    } else {
      if (!packageJson.pnpm) {
        packageJson.pnpm = {}
      }
      if (!packageJson.pnpm.overrides) {
        packageJson.pnpm.overrides = {}
      }
      for (const [key, value] of Object.entries(overrides)) {
        packageJson.pnpm.overrides[key] = value
      }
    }
  } else if (packageManager === 'yarn') {
    if (!packageJson.resolutions) {
      packageJson.resolutions = {}
    }
    for (const [key, value] of Object.entries(overrides)) {
      packageJson.resolutions[key] = value
    }
  }
}
