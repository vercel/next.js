#!/usr/bin/env node

import prompts from 'prompts'
import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { compareVersions } from 'compare-versions'
import yaml from 'yaml'

type VersionSpecifier = 'canary' | 'rc' | 'latest'
type PackageManager = 'pnpm' | 'npm' | 'yarn'

interface Response {
  version: VersionSpecifier
}

async function run(): Promise<void> {
  let targetVersionSpecifier: VersionSpecifier

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
      title: 'Latest Release Candidate',
      value: 'rc',
      description: `Pre-release version for final testing (${nextPackageJson['rc'].version})`,
    })
  }
  choices.push({
    title: 'Latest Stable',
    value: 'latest',
    description: `Production-ready release (${nextPackageJson['latest'].version})`,
  })

  const shortcutVersion = process.argv[2]?.replace('@', '')
  if (['canary', 'rc', 'latest'].includes(shortcutVersion)) {
    // Shortcut
    targetVersionSpecifier = shortcutVersion as VersionSpecifier
  } else {
    const initialVersionSpecifierIdx = await processCurrentVersion()

    const response: Response = await prompts({
      type: 'select',
      name: 'version',
      message: 'What Next.js version do you want to upgrade to?',
      choices: choices,
      initial: initialVersionSpecifierIdx,
    })

    if (!response.version) {
      return
    }

    targetVersionSpecifier = response.version
  }

  // TODO(LichuAcu): support Turborepo
  const appPackageJsonPath = path.resolve(process.cwd(), 'package.json')
  let appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8'))

  const targetNextPackageJson = nextPackageJson[targetVersionSpecifier]

  if (targetNextPackageJson.version) {
    if (compareVersions(targetNextPackageJson.version, '15.0.0-canary') >= 0) {
      await suggestTurbopack(appPackageJson)
    }
  }

  fs.writeFileSync(appPackageJsonPath, JSON.stringify(appPackageJson, null, 2))

  // TODO(LichuAcu): keep the original styling of the file
  console.log('\nUpdating depencies...\n')

  let packageManager: PackageManager = getPackageManager(appPackageJson)
  const dependencies = `react@${targetNextPackageJson.peerDependencies['react']} react-dom@${targetNextPackageJson.peerDependencies['react-dom']} next@${targetVersionSpecifier}`

  let updateCommand
  switch (packageManager) {
    case 'pnpm':
      updateCommand = `pnpm update ${dependencies}`
      break
    case 'npm':
      updateCommand = `npm install ${dependencies}`
      break
    case 'yarn':
      updateCommand = `yarn add ${dependencies}`
      break
    default:
      updateCommand = `pnpm install next@${targetVersionSpecifier}`
      break
  }

  execSync(updateCommand, {
    stdio: 'inherit',
  })

  appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8'))
  appPackageJson.dependencies['next'] = targetVersionSpecifier
  fs.writeFileSync(appPackageJsonPath, JSON.stringify(appPackageJson, null, 2))

  console.log(
    '\nYour Next.js project has been upgraded successfully. Time to ship! 🚢'
  )
}

/*
 * Logs the current version and returns the index of the current version specifier
 * in the array ['canary', 'rc', 'latest']
 */
async function processCurrentVersion(): Promise<number> {
  // TODO(LichuAcu): support Turborepo
  const appLockFilePath = path.resolve(process.cwd(), 'pnpm-lock.yaml')
  if (fs.existsSync(appLockFilePath)) {
    const appLockFileContent = fs.readFileSync(appLockFilePath, 'utf8')
    const appLockFile = yaml.parse(appLockFileContent)
    const appNextDependency = appLockFile.importers?.['.']?.dependencies?.next

    if (appNextDependency) {
      if (appNextDependency.version) {
        console.log(
          `You are currently using Next.js ${appNextDependency.version.split('(')[0]}`
        )
      }
      if (appNextDependency.specifier) {
        switch (appNextDependency.specifier) {
          case 'canary':
            return 0
          case 'rc':
            return 1
          case 'latest':
            return 2
          default:
            return 0
        }
      }
    }
  }
  return 0
}

// TODO(LichuAcu): return the user's package manager
function getPackageManager(_packageJson: any): PackageManager {
  return 'pnpm'
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

  const responseTurbopack = await prompts({
    type: 'confirm',
    name: 'enable',
    message:
      'Turbopack is stable for development in this version. Do you want to enable it?',
    initial: true,
  })

  // TODO(LichuAcu): handle ctrl-c

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
