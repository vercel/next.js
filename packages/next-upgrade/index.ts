#!/usr/bin/env node

import prompts from 'prompts'
import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { compareVersions } from 'compare-versions'
import chalk from 'chalk'
import which from 'which'
import { createRequire } from 'node:module'

type StandardVersionSpecifier = 'canary' | 'rc' | 'latest'
type CustomVersionSpecifier = string
type VersionSpecifier = StandardVersionSpecifier | CustomVersionSpecifier
type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

interface Response {
  version: StandardVersionSpecifier
}

async function run(): Promise<void> {
  const appPackageJsonPath = path.resolve(process.cwd(), 'package.json')
  let appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8'))

  await detectWorkspace(appPackageJson)

  let targetNextPackageJson
  let targetVersionSpecifier: VersionSpecifier = ''

  const shortcutVersion = process.argv[2]?.replace('@', '')
  if (shortcutVersion) {
    const res = await fetch(
      `https://registry.npmjs.org/next/${shortcutVersion}`
    )
    if (res.status === 200) {
      targetNextPackageJson = await res.json()
      targetVersionSpecifier = targetNextPackageJson.version
    } else {
      console.error(
        `${chalk.yellow('Next.js ' + shortcutVersion)} does not exist. Check available versions at ${chalk.underline('https://www.npmjs.com/package/next?activeTab=versions')}, or choose one from below\n`
      )
    }
  }

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

    const initialVersionSpecifierIdx = await processCurrentVersion(showRc)

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

  if (
    targetNextPackageJson.version &&
    compareVersions(targetNextPackageJson.version, '15.0.0-canary') >= 0
  ) {
    await suggestTurbopack(appPackageJson)
  }

  fs.writeFileSync(appPackageJsonPath, JSON.stringify(appPackageJson, null, 2))

  const packageManager: PackageManager = await getPackageManager(appPackageJson)
  const reactDependencies = [
    `react@${targetNextPackageJson.peerDependencies['react']}`,
    `@types/react@${targetNextPackageJson.devDependencies['@types/react']}`,
    `react-dom@${targetNextPackageJson.peerDependencies['react-dom']}`,
    `@types/react-dom@${targetNextPackageJson.devDependencies['@types/react-dom']}`,
  ]
  const nextDependency = `next@${targetNextPackageJson.version}`

  let updateCommand
  switch (packageManager) {
    case 'pnpm':
      updateCommand = `pnpm update ${reactDependencies.join(' ')} ${nextDependency}`
      break
    case 'npm':
      // npm will error out if all dependencies are updated at once because the new next
      // version depends on the new react and react-dom versions we are installing
      updateCommand = `npm install ${reactDependencies.join(' ')} && npm install ${nextDependency}`
      break
    case 'yarn':
      updateCommand = `yarn add ${reactDependencies.join(' ')} ${nextDependency}`
      break
    case 'bun':
      updateCommand = `bun add ${reactDependencies.join(' ')} ${nextDependency}`
      break
    default:
      throw new Error(`Unreachable code`)
  }

  console.log(
    `Upgrading your project to ${chalk.blue('Next.js ' + targetVersionSpecifier)}...\n`
  )
  execSync(updateCommand, {
    stdio: 'inherit',
  })

  appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8'))
  appPackageJson.dependencies['next'] = targetVersionSpecifier
  fs.writeFileSync(appPackageJsonPath, JSON.stringify(appPackageJson, null, 2))

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

/*
 * Logs the current version and returns the index of the current version specifier
 * in the array ['canary', 'rc', 'latest']
 */
async function processCurrentVersion(showRc: boolean): Promise<number> {
  const require = createRequire(import.meta.url)
  const installedNextPackageJsonDir = require.resolve('next/package.json', {
    paths: [process.cwd()],
  })
  const installedNextPackageJson = JSON.parse(
    fs.readFileSync(installedNextPackageJsonDir, 'utf8')
  )
  let installedNextVersion = installedNextPackageJson.version

  if (installedNextVersion == null) {
    return 0
  }

  console.log(
    `You are currently using ${chalk.blue('Next.js ' + installedNextVersion)}`
  )

  if (installedNextVersion.includes('canary')) {
    return 0
  }
  if (installedNextVersion.includes('rc')) {
    return 1 // If rc is not available, will default to latest's index
  }
  return showRc ? 2 : 1 // "latest" is 1 or 2 depending on if rc is shown as an option
}

async function getPackageManager(_packageJson: any): Promise<PackageManager> {
  const packageManagers = {
    pnpm: 'pnpm-lock.yaml',
    yarn: 'yarn.lock',
    npm: 'package-lock.json',
    bun: 'bun.lockb',
  }

  function findLockFile(dir: string): PackageManager[] {
    const packageJsonPath = path.join(dir, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      let detectedPackageManagers: PackageManager[] = []
      let packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (packageJson.packageManager) {
        // corepack
        let packageManagerName = packageJson.packageManager.split(
          '@'
        )[0] as PackageManager
        if (packageManagerName in packageManagers) {
          return [packageManagerName]
        }
      }
      for (const [packageManager, lockFile] of Object.entries(
        packageManagers
      )) {
        const lockFilePath = path.join(dir, lockFile)
        if (fs.existsSync(lockFilePath)) {
          detectedPackageManagers.push(packageManager as PackageManager)
        }
      }
      if (detectedPackageManagers.length !== 0) {
        return detectedPackageManagers
      }
    }
    const parentDir = path.dirname(dir)
    if (parentDir !== dir) {
      return findLockFile(parentDir)
    }
    return []
  }

  let realPath = fs.realpathSync(process.cwd())
  const detectedPackageManagers = findLockFile(realPath)

  // Exactly one package manager detected
  if (detectedPackageManagers.length === 1) {
    return detectedPackageManagers[0]
  }

  // Multiple package managers detected
  if (detectedPackageManagers.length > 1) {
    const responsePackageManager = await prompts(
      {
        type: 'select',
        name: 'packageManager',
        message: 'Multiple package managers detected. Which one are you using?',
        choices: detectedPackageManagers.map((packageManager) => ({
          title: packageManager,
          value: packageManager,
        })),
        initial: 0,
      },
      {
        onCancel: () => {
          process.exit(0)
        },
      }
    )

    console.log(
      `${chalk.red('⚠️')} To avoid this next time, keep only one of ${detectedPackageManagers.map((packageManager) => chalk.underline(packageManagers[packageManager])).join(' or ')}\n`
    )

    return responsePackageManager.packageManager as PackageManager
  }

  // No package manager detected
  let choices = ['pnpm', 'yarn', 'npm', 'bun']
    .filter((packageManager) => which.sync(packageManager, { nothrow: true }))
    .map((packageManager) => ({
      title: packageManager,
      value: packageManager,
    }))

  const responsePackageManager = await prompts(
    {
      type: 'select',
      name: 'packageManager',
      message: 'No package manager detected. Which one are you using?',
      choices: choices,
    },
    {
      onCancel: () => {
        process.exit(0)
      },
    }
  )

  return responsePackageManager.packageManager as PackageManager
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

run().catch(console.error)
