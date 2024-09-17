#!/usr/bin/env node

import prompts from 'prompts'
import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { compareVersions } from 'compare-versions'
import yaml from 'yaml'
import chalk from 'chalk'
import which from 'which'

type StandardVersionSpecifier = 'canary' | 'rc' | 'latest'
type CustomVersionSpecifier = string
type VersionSpecifier = StandardVersionSpecifier | CustomVersionSpecifier
type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

interface Response {
  version: StandardVersionSpecifier
}

async function run(): Promise<void> {
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

  const appPackageJsonPath = path.resolve(process.cwd(), 'package.json')
  let appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8'))

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
    `Upgrading your project to ${chalk.blueBright('Next.js ' + targetVersionSpecifier)}...\n`
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

/*
 * Logs the current version and returns the index of the current version specifier
 * in the array ['canary', 'rc', 'latest']
 */
async function processCurrentVersion(showRc: boolean): Promise<number> {
  // TODO(LichuAcu): support other package managers
  const appLockFilePath = path.resolve(process.cwd(), 'pnpm-lock.yaml')
  if (fs.existsSync(appLockFilePath)) {
    const appLockFileContent = fs.readFileSync(appLockFilePath, 'utf8')
    const appLockFile = yaml.parse(appLockFileContent)
    const appNextDependency = appLockFile.importers?.['.']?.dependencies?.next

    if (appNextDependency) {
      if (appNextDependency.version) {
        console.log(
          `You are currently using ${chalk.blueBright('Next.js ' + appNextDependency.version.split('(')[0])}`
        )
      }
      if (appNextDependency.specifier) {
        switch (appNextDependency.specifier) {
          case 'canary':
            return 0
          case 'rc':
            return 1 // If rc is not available, will return the latest version's index
          case 'latest':
            return showRc ? 2 : 1
          default:
            return 0
        }
      }
    }
  }
  return 0
}

async function getPackageManager(_packageJson: any): Promise<PackageManager> {
  const detectedPackageManagers: [PackageManager, string][] = []

  for (const { lockFile, packageManager } of [
    { lockFile: 'pnpm-lock.yaml', packageManager: 'pnpm' },
    { lockFile: 'yarn.lock', packageManager: 'yarn' },
    { lockFile: 'package-lock.json', packageManager: 'npm' },
    { lockFile: 'bun.lockb', packageManager: 'bun' },
  ]) {
    if (fs.existsSync(path.join(process.cwd(), lockFile))) {
      detectedPackageManagers.push([packageManager as PackageManager, lockFile])
    }
  }

  // Exactly one package manager detected
  if (detectedPackageManagers.length === 1) {
    return detectedPackageManagers[0][0]
  }

  // Multiple package managers detected
  if (detectedPackageManagers.length > 1) {
    const responsePackageManager = await prompts(
      {
        type: 'select',
        name: 'packageManager',
        message: 'Multiple package managers detected. Which one are you using?',
        choices: detectedPackageManagers.map((packageManager) => ({
          title: packageManager[0],
          value: packageManager[0],
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
      `${chalk.red('⚠️')} To avoid this next time, keep only one of ${detectedPackageManagers.map((packageManager) => chalk.underline(packageManager[1])).join(' or ')}\n`
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
