import * as os from 'os'
import prompts from 'prompts'
import fs from 'fs'
import {
  satisfies as satisfiesVersionRange,
  compare as compareVersions,
} from 'semver'
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
    // But we want the highest version.
    versionOrVersions.sort(compareVersions)
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

const cwd = process.cwd()

export async function runUpgrade(
  revision: string | undefined,
  options: { verbose: boolean }
): Promise<void> {
  const { verbose } = options
  const appPackageJsonPath = path.resolve(cwd, 'package.json')
  let appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8'))

  let targetNextPackageJson: {
    version: string
    peerDependencies: Record<string, string>
  }

  try {
    const targetNextPackage = execSync(
      `npm --silent view "next@${revision}" --json`,
      { encoding: 'utf-8' }
    )
    targetNextPackageJson = JSON.parse(targetNextPackage)
  } catch {}

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

  if (compareVersions(targetNextVersion, '15.0.0-canary') >= 0) {
    await suggestTurbopack(appPackageJson, targetNextVersion)
  }

  const codemods = await suggestCodemods(
    installedNextVersion,
    targetNextVersion
  )
  const packageManager: PackageManager = getPkgManager(cwd)

  let shouldRunReactCodemods = false
  let shouldRunReactTypesCodemods = false
  let execCommand = 'npx'
  // The following React codemods are for React 19
  if (
    !shouldStayOnReact18 &&
    compareVersions(targetReactVersion, '19.0.0-0') >= 0 &&
    compareVersions(installedReactVersion, '19.0.0-0') < 0
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
    `Upgrading your project to ${pc.blue('Next.js ' + targetNextVersion)}...`
  )

  for (const [dep, version] of dependenciesToInstall) {
    addPackageDependency(appPackageJson, dep, version, false)
  }
  for (const [dep, version] of devDependenciesToInstall) {
    addPackageDependency(appPackageJson, dep, version, true)
  }

  fs.writeFileSync(
    appPackageJsonPath,
    JSON.stringify(appPackageJson, null, 2) +
      // Common IDE formatters would add a newline as well.
      os.EOL
  )

  runInstallation(packageManager, { cwd })

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

  endMessage()
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
