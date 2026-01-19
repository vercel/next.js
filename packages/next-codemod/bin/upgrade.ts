import * as os from 'os'
import prompts from 'prompts'
import fs from 'fs'
import {
  satisfies as satisfiesVersionRange,
  compare as compareVersions,
  major,
  minor,
} from 'semver'
import { execSync } from 'child_process'
import path from 'path'
import pc from 'picocolors'
import {
  getPkgManager,
  addPackageDependency,
  runInstallation,
  type InstallationError,
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
  '@next/mdx',
  '@next/plugin-storybook',
  '@next/polyfill-module',
  '@next/polyfill-nomodule',
  '@next/swc',
  '@next/react-refresh-utils',
  '@next/third-parties',
]

/**
 * Fetches the peer dependencies of a specific package version from npm.
 */
async function getPackagePeerDependencies(
  packageName: string,
  version: string
): Promise<Record<string, string> | null> {
  try {
    const packageInfo = execSync(
      `npm --silent view "${packageName}@${version}" peerDependencies --json`,
      { encoding: 'utf-8' }
    )
    return JSON.parse(packageInfo)
  } catch {
    return null
  }
}

/**
 * Checks if a version satisfies a given range.
 */
function checkVersionSatisfies(version: string, range: string): boolean {
  try {
    return satisfiesVersionRange(version, range, { includePrerelease: true })
  } catch {
    return false
  }
}

interface PeerDependencyConflict {
  packageName: string
  peerDependency: string
  requiredRange: string
  installedVersion: string
}

/**
 * Checks for peer dependency conflicts before installation.
 * Returns a list of conflicts that would cause installation to fail.
 */
async function checkPeerDependencyConflicts(
  packagesToUpgrade: Array<{ name: string; version: string }>,
  allDependencies: Record<string, string>
): Promise<PeerDependencyConflict[]> {
  const conflicts: PeerDependencyConflict[] = []

  for (const pkg of packagesToUpgrade) {
    const peerDeps = await getPackagePeerDependencies(pkg.name, pkg.version)
    if (!peerDeps) continue

    for (const [peerDep, requiredRange] of Object.entries(peerDeps)) {
      // Skip if the peer dependency is also being upgraded
      if (packagesToUpgrade.some((p) => p.name === peerDep)) continue

      // Check if the peer dependency is installed in the project
      const installedVersion = allDependencies[peerDep]
      if (!installedVersion) continue

      // Try to resolve the actual installed version
      let resolvedVersion = installedVersion
      try {
        const pkgJsonPath = require.resolve(`${peerDep}/package.json`, {
          paths: [cwd],
        })
        resolvedVersion = require(pkgJsonPath).version
      } catch {
        // If we can't resolve the version, use the semver range to check
        // This is a best-effort check
        if (
          installedVersion.startsWith('^') ||
          installedVersion.startsWith('~')
        ) {
          // Extract the base version from the range
          const match = installedVersion.match(/[\d.]+/)
          if (match) {
            resolvedVersion = match[0]
          }
        }
      }

      if (!checkVersionSatisfies(resolvedVersion, requiredRange)) {
        conflicts.push({
          packageName: pkg.name,
          peerDependency: peerDep,
          requiredRange,
          installedVersion: resolvedVersion,
        })
      }
    }
  }

  return conflicts
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
  const versionOrVersions = JSON.parse(versionsJSON)
  if (versionOrVersions.length < 1) {
    throw new Error(
      `Found no React versions matching "${query}". This is a bug in the upgrade tool.`
    )
  }
  // npm-view returns an array if there are multiple versions matching the query.
  if (Array.isArray(versionOrVersions)) {
    // The last entry will be the latest version published.
    // But we want the highest version.
    versionOrVersions.sort(compareVersions)
    return versionOrVersions[versionOrVersions.length - 1]
  }
  return versionOrVersions
}

function endMessage(targetNextVersion: string) {
  console.log()
  if (major(targetNextVersion) === 15) {
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
}

const cwd = process.cwd()

/**
 * Resolves semantic version keywords (patch, minor, major) to npm version queries.
 * - patch: latest patch within current minor (e.g., 15.0.x -> 15.0.y)
 * - minor: latest minor within current major (e.g., 15.0.x -> 15.1.x)
 * - major: latest stable version (equivalent to "latest")
 */
function resolveSemanticRevision(
  revision: string,
  installedVersion: string
): string {
  const installedMajor = major(installedVersion)
  const installedMinor = minor(installedVersion)

  switch (revision) {
    case 'patch':
      // ~15.0.0 matches >=15.0.0 <15.1.0
      return `~${installedMajor}.${installedMinor}.0`
    case 'minor':
      // ^15.0.0 matches >=15.0.0 <16.0.0
      return `^${installedMajor}.0.0`
    case 'major':
      return 'latest'
    default:
      return revision
  }
}

export async function runUpgrade(
  revision: string | undefined,
  options: { verbose: boolean }
): Promise<void> {
  const { verbose } = options
  const appPackageJsonPath = path.resolve(cwd, 'package.json')
  let appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8'))

  const installedNextVersion = getInstalledNextVersion()

  // Resolve semantic keywords to npm version queries
  const resolvedRevision = resolveSemanticRevision(
    revision ?? 'minor',
    installedNextVersion
  )

  if (options.verbose) {
    console.log(`  Resolved upgrade target: ${resolvedRevision}`)
  }

  let targetNextPackageJson: {
    version: string
    peerDependencies: Record<string, string>
  }

  try {
    // First, find the highest matching version
    const versionsJSON = execSync(
      `npm --silent view "next@${resolvedRevision}" --json --field version`,
      { encoding: 'utf-8' }
    )
    const versionOrVersions = JSON.parse(versionsJSON)
    let targetVersion: string
    if (Array.isArray(versionOrVersions)) {
      versionOrVersions.sort(compareVersions)
      targetVersion = versionOrVersions[versionOrVersions.length - 1]
    } else {
      targetVersion = versionOrVersions
    }

    if (options.verbose) {
      console.log(`  Target version: ${targetVersion}`)
    }

    // Then fetch the full package info for that specific version
    const targetNextPackage = execSync(
      `npm --silent view "next@${targetVersion}" --json`,
      { encoding: 'utf-8' }
    )
    targetNextPackageJson = JSON.parse(targetNextPackage)
  } catch (e) {
    if (options.verbose) {
      console.error('  Error fetching package info:', e)
    }
  }

  const validRevision =
    targetNextPackageJson !== null &&
    typeof targetNextPackageJson === 'object' &&
    'version' in targetNextPackageJson &&
    'peerDependencies' in targetNextPackageJson
  if (!validRevision) {
    throw new BadInput(
      `Invalid revision provided: "${revision ?? 'minor'}" (resolved to "${resolvedRevision}"). Please provide a valid Next.js version, dist-tag (e.g. "latest", "canary", "rc"), or upgrade type ("patch", "minor", "major").\nCheck available versions at https://www.npmjs.com/package/next?activeTab=versions.`
    )
  }

  const targetNextVersion = targetNextPackageJson.version

  if (compareVersions(installedNextVersion, targetNextVersion) === 0) {
    console.log(
      `${pc.green('✓')} Current Next.js version is already on the target version "v${targetNextVersion}".`
    )
    endMessage(targetNextVersion)
    return
  }
  if (compareVersions(installedNextVersion, targetNextVersion) > 0) {
    console.log(
      `${pc.green('✓')} Current Next.js version is higher than the target version "v${targetNextVersion}".`
    )
    endMessage(targetNextVersion)
    return
  }

  const installedReactVersion = getInstalledReactVersion()
  // Align the prefix spaces
  console.log(`  Detected installed versions:`)
  console.log(`  - React: v${installedReactVersion}`)
  console.log(`  - Next.js: v${installedNextVersion}`)
  let shouldStayOnReact18 = false

  const usesAppDir = isUsingAppDir(cwd)
  const usesPagesDir = isUsingPagesDir(cwd)

  const isPureAppRouter = usesAppDir && !usesPagesDir
  const isMixedApp = usesPagesDir && usesAppDir
  if (
    // From release v14.3.0-canary.45, Next.js expects the React version to be 19.0.0-beta.0
    // If the user is on a version higher than this but is still on React 18, we ask them
    // if they still want to stay on React 18 after the upgrade.
    // IF THE USER USES APP ROUTER, we expect them to upgrade React to > 19.0.0-beta.0,
    // we should only let the user stay on React 18 if they are using pure Pages Router.
    // x-ref(PR): https://github.com/vercel/next.js/pull/65058
    // x-ref(release): https://github.com/vercel/next.js/releases/tag/v14.3.0-canary.45
    compareVersions(targetNextVersion, '14.3.0-canary.45') >= 0 &&
    installedReactVersion.startsWith('18') &&
    // Pure App Router always uses React 19
    // The mixed case is tricky to handle from a types perspective.
    // We'll recommend to upgrade in the prompt but users can decide to try 18.
    !isPureAppRouter
  ) {
    const shouldStayOnReact18Res = await prompts(
      {
        type: 'confirm',
        name: 'shouldStayOnReact18',
        message:
          `Do you prefer to stay on React 18?` +
          (isMixedApp
            ? " Since you're using both pages/ and app/, we recommend upgrading React to use a consistent version throughout your app."
            : ''),
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

  if (
    compareVersions(targetNextVersion, '15.0.0-canary') >= 0 &&
    compareVersions(targetNextVersion, '16.0.0-canary') < 0
  ) {
    await suggestTurbopack(appPackageJson, targetNextVersion)
  }

  // In Next.js 16+, Turbopack is the default for `next dev`, so remove the flag
  if (compareVersions(targetNextVersion, '16.0.0-canary') >= 0) {
    await removeTurbopackFlag(appPackageJson)
  }

  const codemods = await suggestCodemods(
    installedNextVersion,
    targetNextVersion
  )
  const packageManager: PackageManager = getPkgManager(cwd)

  let shouldRunReactCodemods = false
  let shouldRunReactTypesCodemods = false
  let execCommand = 'npx --yes'
  // The following React codemods are for React 19
  if (
    !shouldStayOnReact18 &&
    compareVersions(targetReactVersion, '19.0.0-0') >= 0 &&
    compareVersions(installedReactVersion, '19.0.0-0') < 0
  ) {
    shouldRunReactCodemods = await suggestReactCodemods()
    shouldRunReactTypesCodemods = await suggestReactTypesCodemods()

    execCommand = getNpxCommand(packageManager)
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
    `Upgrading your project to ${pc.blue('Next.js ' + targetNextVersion)}...`
  )

  for (const [dep, version] of dependenciesToInstall) {
    addPackageDependency(appPackageJson, dep, version, false)
  }
  for (const [dep, version] of devDependenciesToInstall) {
    addPackageDependency(appPackageJson, dep, version, true)
  }

  // Check for peer dependency conflicts before installation
  const packagesToUpgrade = [
    ...dependenciesToInstall.map(([name, version]) => ({ name, version })),
    ...devDependenciesToInstall.map(([name, version]) => ({ name, version })),
  ]

  const conflicts = await checkPeerDependencyConflicts(
    packagesToUpgrade,
    allDependencies
  )

  // Handle ESLint version conflicts specifically
  const eslintConflict = conflicts.find(
    (c) =>
      c.peerDependency === 'eslint' && c.packageName === 'eslint-config-next'
  )

  if (eslintConflict) {
    console.log()
    console.log(
      `${pc.yellow('⚠')} ${pc.bold('eslint-config-next@' + targetNextVersion)} requires ${pc.bold('eslint@' + eslintConflict.requiredRange)}, ` +
        `but you have ${pc.bold('eslint@' + eslintConflict.installedVersion)} installed.`
    )

    const { upgradeEslint } = await prompts(
      {
        type: 'confirm',
        name: 'upgradeEslint',
        message: `Would you like to upgrade ESLint to a compatible version?`,
        initial: true,
      },
      { onCancel }
    )

    if (upgradeEslint) {
      try {
        // Find the latest ESLint version that satisfies the requirement
        const targetEslintVersion = await loadHighestNPMVersionMatching(
          `eslint@${eslintConflict.requiredRange}`
        )

        if (appPackageJson.devDependencies?.['eslint']) {
          addPackageDependency(
            appPackageJson,
            'eslint',
            targetEslintVersion,
            true
          )
          devDependenciesToInstall.push(['eslint', targetEslintVersion])
        } else if (appPackageJson.dependencies?.['eslint']) {
          addPackageDependency(
            appPackageJson,
            'eslint',
            targetEslintVersion,
            false
          )
          dependenciesToInstall.push(['eslint', targetEslintVersion])
        }

        console.log(
          `${pc.green('✔')} Will upgrade ESLint to v${targetEslintVersion}`
        )

        // When upgrading to ESLint 9+, also upgrade @typescript-eslint packages
        // because v7.x only supports ESLint 8.x, v8.x+ supports ESLint 9.x
        if (major(targetEslintVersion) >= 9) {
          const typescriptEslintPackages = [
            '@typescript-eslint/parser',
            '@typescript-eslint/eslint-plugin',
          ]

          for (const tsEslintPkg of typescriptEslintPackages) {
            const hasPackage = allDependencies[tsEslintPkg]
            if (!hasPackage) continue

            // Check if the installed version is < 8 (v8+ supports ESLint 9)
            let installedVersion = hasPackage
            try {
              const pkgJsonPath = require.resolve(`${tsEslintPkg}/package.json`, {
                paths: [cwd],
              })
              installedVersion = require(pkgJsonPath).version
            } catch {
              // Use the semver range to extract version
              const match = hasPackage.match(/[\d.]+/)
              if (match) installedVersion = match[0]
            }

            // Only upgrade if current version is < 8
            if (major(installedVersion) < 8) {
              try {
                const targetTsEslintVersion = await loadHighestNPMVersionMatching(
                  `${tsEslintPkg}@^8`
                )

                if (appPackageJson.devDependencies?.[tsEslintPkg]) {
                  addPackageDependency(
                    appPackageJson,
                    tsEslintPkg,
                    targetTsEslintVersion,
                    true
                  )
                  devDependenciesToInstall.push([
                    tsEslintPkg,
                    targetTsEslintVersion,
                  ])
                } else if (appPackageJson.dependencies?.[tsEslintPkg]) {
                  addPackageDependency(
                    appPackageJson,
                    tsEslintPkg,
                    targetTsEslintVersion,
                    false
                  )
                  dependenciesToInstall.push([tsEslintPkg, targetTsEslintVersion])
                }

                console.log(
                  `${pc.green('✔')} Will upgrade ${tsEslintPkg} to v${targetTsEslintVersion}`
                )
              } catch (e) {
                console.error(
                  `${pc.red('✖')} Failed to find compatible ${tsEslintPkg} version: ${e instanceof Error ? e.message : String(e)}`
                )
              }
            }
          }

          // Check if user needs to migrate ESLint config to flat config format
          await suggestEslintConfigMigration(cwd, codemods)
        }

        // Remove this conflict from the list since we're handling it
        const conflictIndex = conflicts.indexOf(eslintConflict)
        if (conflictIndex > -1) {
          conflicts.splice(conflictIndex, 1)
        }
      } catch (e) {
        console.error(
          `${pc.red('✖')} Failed to upgrade ESLint: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    } else {
      console.log()
      console.log(pc.yellow('To resolve this manually, you can either:'))
      console.log(
        `  1. Upgrade ESLint: ${pc.cyan(`${packageManager} ${packageManager === 'npm' ? 'install' : 'add'} eslint@${eslintConflict.requiredRange.replace('>=', '^')}`)}`
      )
      console.log(
        `  2. Use legacy peer deps: ${pc.cyan(`${packageManager} install --legacy-peer-deps`)}`
      )
      console.log()
    }
  }

  // Warn about other peer dependency conflicts
  const otherConflicts = conflicts.filter(
    (c) =>
      !(c.peerDependency === 'eslint' && c.packageName === 'eslint-config-next')
  )

  if (otherConflicts.length > 0) {
    console.log()
    console.log(
      `${pc.yellow('⚠')} Detected ${otherConflicts.length} potential peer dependency ${otherConflicts.length === 1 ? 'conflict' : 'conflicts'}:`
    )
    for (const conflict of otherConflicts) {
      console.log(
        `  ${pc.bold(conflict.packageName)} requires ${pc.bold(conflict.peerDependency + '@' + conflict.requiredRange)}, ` +
          `but ${pc.bold(conflict.peerDependency + '@' + conflict.installedVersion)} is installed`
      )
    }
    console.log()
    console.log(
      `${pc.dim('These may cause installation issues. Consider updating these dependencies after the upgrade.')}`
    )
  }

  fs.writeFileSync(
    appPackageJsonPath,
    JSON.stringify(appPackageJson, null, 2) +
      // Common IDE formatters would add a newline as well.
      os.EOL
  )

  try {
    await runInstallation(packageManager, { cwd })
  } catch (error) {
    const installError = error as InstallationError

    if (installError.isPeerDependencyError) {
      console.log()
      console.log(
        pc.red('✖') + ' Installation failed due to peer dependency conflicts.'
      )
      console.log()
      console.log(pc.bold('To resolve this, you can try one of the following:'))
      console.log()
      console.log(
        `  ${pc.cyan('1.')} Upgrade conflicting dependencies to compatible versions`
      )
      console.log(
        `     Check which packages have peer dependency conflicts and upgrade them.`
      )
      console.log()
      console.log(
        `  ${pc.cyan('2.')} Use legacy peer dependency resolution (${pc.yellow('not recommended')})`
      )

      const legacyCommand =
        packageManager === 'npm'
          ? 'npm install --legacy-peer-deps'
          : packageManager === 'yarn'
            ? 'yarn install --ignore-engines'
            : packageManager === 'pnpm'
              ? 'pnpm install --ignore-peer-deps'
              : 'bun install'

      console.log(`     Run: ${pc.cyan(legacyCommand)}`)
      console.log()
      console.log(
        `  ${pc.cyan('3.')} Revert the package.json changes and try again`
      )
      console.log(`     Run: ${pc.cyan('git checkout package.json')}`)
      console.log()
      console.log(
        pc.dim(
          'Note: Your package.json has been updated but dependencies were not installed.'
        )
      )
      console.log(
        pc.dim(
          "Fix the peer dependency conflicts and run your package manager's install command manually."
        )
      )
    } else {
      console.log()
      console.log(
        pc.red('✖') + ' Installation failed. Please check the error above.'
      )
      console.log()
      console.log(
        pc.dim(
          "Your package.json has been updated. Try running your package manager's install command manually."
        )
      )
    }

    throw error
  }

  for (const codemod of codemods) {
    await runTransform(codemod, cwd, { force: true, verbose })
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

  warnDependenciesOutOfRange(appPackageJson, versionMapping)

  endMessage(targetNextVersion)
}

function getInstalledNextVersion(): string {
  try {
    return require(
      require.resolve('next/package.json', {
        paths: [cwd],
      })
    ).version
  } catch (error) {
    throw new BadInput(
      `Failed to get the installed Next.js version at "${cwd}".\nIf you're using a monorepo, please run this command from the Next.js app directory.`,
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
        paths: [cwd],
      })
    ).version
  } catch (error) {
    throw new BadInput(
      `Failed to detect the installed React version in "${cwd}".\nIf you're working in a monorepo, please run this command from the Next.js app directory.`,
      {
        cause: error,
      }
    )
  }
}

function isUsingPagesDir(projectPath: string): boolean {
  return (
    fs.existsSync(path.resolve(projectPath, 'pages')) ||
    fs.existsSync(path.resolve(projectPath, 'src/pages'))
  )
}
function isUsingAppDir(projectPath: string): boolean {
  return (
    fs.existsSync(path.resolve(projectPath, 'app')) ||
    fs.existsSync(path.resolve(projectPath, 'src/app'))
  )
}

/*
 * Heuristics are used to determine whether to Turbopack is enabled or not and
 * to determine how to update the dev script.
 *
 * 1. If the dev script contains `--turbopack` option, we assume that Turbopack is
 *    already enabled.
 * 2. If the dev script contains the string `next dev`, we replace it to
 *    `next dev --turbopack`.
 * 3. Otherwise, we ask the user to manually add `--turbopack` to their dev command,
 *    showing the current dev command as the initial value.
 */
async function suggestTurbopack(
  packageJson: any,
  targetNextVersion: string
): Promise<void> {
  const devScript: string | undefined = packageJson.scripts?.['dev']
  // Turbopack flag was changed from `--turbo` to `--turbopack` in v15.0.1-canary.3
  // PR: https://github.com/vercel/next.js/pull/71657
  // Release: https://github.com/vercel/next.js/releases/tag/v15.0.1-canary.3
  const isAfterTurbopackFlagChange =
    compareVersions(targetNextVersion, '15.0.1-canary.3') >= 0
  const turboPackFlag = isAfterTurbopackFlagChange ? '--turbopack' : '--turbo'

  if (!devScript) {
    console.log(
      `${pc.yellow('⚠')} No "dev" script found in your package.json. Skipping Turbopack suggestion.`
    )
    return
  }

  if (devScript.includes('next dev')) {
    // covers "--turbopack" as well
    if (devScript.includes('--turbo')) {
      if (isAfterTurbopackFlagChange && !devScript.includes('--turbopack')) {
        console.log() // new line
        console.log(
          `${pc.green('✔')} Replaced "--turbo" with "--turbopack" in your dev script.`
        )
        console.log() // new line
        packageJson.scripts['dev'] = devScript.replace('--turbo', '--turbopack')
        return
      }
      return
    }

    const responseTurbopack = await prompts(
      {
        type: 'confirm',
        name: 'enable',
        message: `Enable Turbopack for ${pc.bold('next dev')}?`,
        initial: true,
      },
      { onCancel }
    )

    if (!responseTurbopack.enable) {
      return
    }

    packageJson.scripts['dev'] = devScript.replace(
      'next dev',
      `next dev ${turboPackFlag}`
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
      message: `Please manually add "${turboPackFlag}" to your dev command.`,
      initial: devScript,
    },
    { onCancel }
  )

  packageJson.scripts['dev'] =
    responseCustomDevScript.customDevScript || devScript
}

/*
 * Checks if the user has a legacy ESLint config that needs migration.
 * ESLint 9 uses flat config format (eslint.config.js) instead of .eslintrc.*
 */
function hasLegacyEslintConfig(projectPath: string): boolean {
  const legacyConfigs = [
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
  ]

  return legacyConfigs.some((config) =>
    fs.existsSync(path.join(projectPath, config))
  )
}

function hasFlatEslintConfig(projectPath: string): boolean {
  const flatConfigs = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
    'eslint.config.mts',
    'eslint.config.cts',
  ]

  return flatConfigs.some((config) =>
    fs.existsSync(path.join(projectPath, config))
  )
}

/*
 * When upgrading to ESLint 9+, suggest running the ESLint config migration
 * codemod if the user has a legacy .eslintrc.* config.
 */
async function suggestEslintConfigMigration(
  projectPath: string,
  codemods: string[]
): Promise<void> {
  const hasLegacy = hasLegacyEslintConfig(projectPath)
  const hasFlat = hasFlatEslintConfig(projectPath)

  // If user already has flat config or the codemod is already in the list, skip
  if (hasFlat || codemods.includes('next-lint-to-eslint-cli')) {
    return
  }

  if (hasLegacy) {
    console.log()
    console.log(
      `${pc.yellow('⚠')} ESLint 9 uses the new flat config format (eslint.config.js).`
    )
    console.log(
      `   Your project has a legacy ESLint config that needs to be migrated.`
    )

    const { runMigration } = await prompts(
      {
        type: 'confirm',
        name: 'runMigration',
        message:
          'Would you like to migrate your ESLint config to flat config format?',
        initial: true,
      },
      { onCancel }
    )

    if (runMigration) {
      // Add the codemod to the list to be run
      codemods.push('next-lint-to-eslint-cli')
      console.log(`${pc.green('✔')} Will run ESLint config migration codemod`)
    } else {
      console.log()
      console.log(pc.dim('To migrate manually, run:'))
      console.log(pc.cyan('  npx @next/codemod next-lint-to-eslint-cli'))
      console.log()
    }
  }
}

/*
 * In Next.js 16+, Turbopack is the default for `next dev` and `next build`.
 * This function removes the `--turbopack` or `--turbo` flag from scripts
 * since it's no longer needed.
 */
async function removeTurbopackFlag(packageJson: any): Promise<void> {
  const scriptsToCheck = ['dev', 'build']
  const updatedScripts: string[] = []

  for (const scriptName of scriptsToCheck) {
    const script: string | undefined = packageJson.scripts?.[scriptName]

    if (!script) {
      continue
    }

    // Check if this is a Next.js script with --turbopack or --turbo
    const isNextScript = script.includes(`next ${scriptName}`)
    const hasTurbopackFlag =
      script.includes('--turbopack') || script.includes('--turbo')

    if (isNextScript && hasTurbopackFlag) {
      // Remove the flag (handle both with and without leading space)
      const updatedScript = script
        .replace(/\s+--turbopack\b/g, '')
        .replace(/\s+--turbo\b/g, '')
        .replace(/--turbopack\s*/g, '')
        .replace(/--turbo\s*/g, '')
        .trim()

      packageJson.scripts[scriptName] = updatedScript
      updatedScripts.push(scriptName)
    }
  }

  if (updatedScripts.length > 0) {
    console.log()
    console.log(
      `${pc.green('✔')} Removed "--turbopack" from ${updatedScripts.map((s) => `"${s}"`).join(' and ')} script${updatedScripts.length > 1 ? 's' : ''} (Turbopack is now the default in Next.js 16+)`
    )
  }
}

async function suggestCodemods(
  initialNextVersion: string,
  targetNextVersion: string
): Promise<string[]> {
  // example:
  // codemod version: 15.0.0-canary.45
  // 14.3             -> 15.0.0-canary.45: apply
  // 14.3             -> 15.0.0-canary.44: don't apply
  // 15.0.0-canary.44 -> 15.0.0-canary.45: apply
  // 15.0.0-canary.45 -> 15.0.0-canary.46: don't apply
  // 15.0.0-canary.45 -> 15.0.0          : don't apply
  // 15.0.0-canary.44 -> 15.0.0          : apply
  const initialVersionIndex = TRANSFORMER_INQUIRER_CHOICES.findIndex(
    (codemod) => {
      return compareVersions(codemod.version, initialNextVersion) > 0
    }
  )
  if (initialVersionIndex === -1) {
    return []
  }

  let targetVersionIndex = TRANSFORMER_INQUIRER_CHOICES.findIndex(
    (codemod) => compareVersions(codemod.version, targetNextVersion) > 0
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
      type: 'confirm',
      name: 'runReactCodemod',
      message: 'Would you like to run the React 19 upgrade codemod?',
      initial: true,
    },
    { onCancel }
  )

  return runReactCodemod
}

async function suggestReactTypesCodemods(): Promise<boolean> {
  const { runReactTypesCodemod } = await prompts(
    {
      type: 'confirm',
      name: 'runReactTypesCodemod',
      message: 'Would you like to run the React 19 Types upgrade codemod?',
      initial: true,
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
  const entries = Object.entries(overrides)
  // Avoids writing an empty overrides field into package.json
  // which would be an unnecessary diff.
  if (entries.length === 0) {
    return
  }

  if (packageManager === 'npm') {
    if (!packageJson.overrides) {
      packageJson.overrides = {}
    }
    for (const [key, value] of entries) {
      packageJson.overrides[key] = value
    }
  } else if (packageManager === 'pnpm') {
    // pnpm supports pnpm.overrides and pnpm.resolutions
    if (packageJson.resolutions) {
      for (const [key, value] of entries) {
        packageJson.resolutions[key] = value
      }
    } else {
      if (!packageJson.pnpm) {
        packageJson.pnpm = {}
      }
      if (!packageJson.pnpm.overrides) {
        packageJson.pnpm.overrides = {}
      }
      for (const [key, value] of entries) {
        packageJson.pnpm.overrides[key] = value
      }
    }
  } else if (packageManager === 'yarn') {
    if (!packageJson.resolutions) {
      packageJson.resolutions = {}
    }
    for (const [key, value] of entries) {
      packageJson.resolutions[key] = value
    }
  } else if (packageManager === 'bun') {
    // bun supports both overrides and resolutions
    // x-ref: https://bun.sh/docs/install/overrides
    if (packageJson.resolutions) {
      for (const [key, value] of entries) {
        packageJson.resolutions[key] = value
      }
    } else {
      // add overrides field if it's missing and add overrides
      if (!packageJson.overrides) {
        packageJson.overrides = {}
      }
      for (const [key, value] of entries) {
        packageJson.overrides[key] = value
      }
    }
  }
}

function warnDependenciesOutOfRange(
  appPackageJson: any,
  versionMapping: Record<string, { version: string; required: boolean }>
) {
  const allDirectDependencies = {
    ...appPackageJson.dependencies,
    ...appPackageJson.devDependencies,
  }

  const dependenciesOutOfRange = new Map<
    string,
    {
      [dependency: string]: {
        currentVersion: string
        expectedVersionRange: string
      }
    }
  >()

  const resolvedDependencyVersions = new Map<string, string>()
  for (const dependency of Object.keys(allDirectDependencies)) {
    let pkgJson

    // TODO: Asking package manager for the installed version is most robust e.g. `pnpm why ${dependency}`
    // require.resolve(`${dependency}/package.json`, { paths: [cwd] }) results in previously installed version being used in PNPM
    let pkgJsonFromNodeModules
    try {
      pkgJsonFromNodeModules = path.join(
        cwd,
        'node_modules',
        dependency,
        'package.json'
      )

      pkgJson = JSON.parse(fs.readFileSync(pkgJsonFromNodeModules, 'utf8'))
    } catch {
      console.warn(
        `${pc.yellow('⚠')} Could not find package.json for dependency "${dependency}" at "${pkgJsonFromNodeModules}". This may affect peer dependency checks.`
      )
      continue
    }

    resolvedDependencyVersions.set(dependency, pkgJson.version)

    if ('peerDependencies' in pkgJson) {
      const peerDeps = pkgJson.peerDependencies
      const peerDepsNames = Object.keys(peerDeps)
      const depsToCheck = Object.keys(versionMapping).filter(
        (versionMappingKey) => peerDepsNames.includes(versionMappingKey)
      )

      for (const depName of depsToCheck) {
        const expectedVersionRange = peerDeps[depName]
        const { version: currentVersion } = versionMapping[depName]
        if (
          !satisfiesVersionRange(currentVersion, expectedVersionRange, {
            includePrerelease: true,
          })
        ) {
          dependenciesOutOfRange.set(dependency, {
            ...dependenciesOutOfRange.get(dependency),
            [depName]: {
              currentVersion,
              expectedVersionRange,
            },
          })
        }
      }
    }
  }

  const size = dependenciesOutOfRange.size
  if (size > 0) {
    console.log(
      `${pc.yellow('⚠')} Found ${size} ${
        size === 1 ? 'dependency' : 'dependencies'
      } that seem incompatible with the upgraded package versions.\n` +
        'You may have to update these packages to their latest version or file an issue to ask for support of the upgraded libraries.'
    )
    dependenciesOutOfRange.forEach((deps, packageName) => {
      console.log(
        `${packageName} ${pc.gray(resolvedDependencyVersions.get(packageName))}`
      )
      Object.entries(deps).forEach(([depName, value], index, depsArray) => {
        const prefix = index === depsArray.length - 1 ? '  └── ' : '  ├── '
        console.log(
          `${prefix}${pc.yellow('✕ unmet peer')} ${depName}@"${value.expectedVersionRange}": found ${value.currentVersion}`
        )
      })
    })
  }
}

function getNpxCommand(pkgManager: PackageManager) {
  let command = 'npx --yes'
  if (pkgManager === 'pnpm') {
    command = 'pnpm --silent dlx'
  } else if (pkgManager === 'yarn') {
    try {
      execSync('yarn dlx --help', { stdio: 'ignore', cwd })
      command = 'yarn --quiet dlx'
    } catch {}
  } else if (pkgManager === 'bun') {
    command = 'bunx'
  }

  return command
}
