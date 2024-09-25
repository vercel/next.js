import prompts from 'prompts'
import { execSync } from 'child_process'
import { green, bold, blue, gray } from 'picocolors'
import { compare, compareVersions, validateStrict } from 'compare-versions'
import { getPkgManager, installPackage } from '../lib/handle-package'
import { CODEMOD_CHOICES } from '../lib/utils'
import { onPromptState } from './next-codemod'

type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'
type Version = 'canary' | 'rc' | 'latest' | string

const cwd = process.cwd()

export async function runUpgrade(version?: Version): Promise<void> {
  const installedNextVersion = await getInstalledNextVersion()

  console.log()
  console.log(`Current Next.js version: v${installedNextVersion}`)
  console.log()

  let targetPkgJson
  let targetNextVersion = ''

  const isValidVersion = validateStrict(version)
  if (version && !isValidVersion) {
    console.log(
      `"${version}" is an invalid version syntax. See "https://www.npmjs.com/package/next?activeTab=versions".`
    )
    console.log()
  }

  const isTag = ['canary', 'rc', 'latest'].includes(version)
  if (isTag || isValidVersion) {
    const res = await fetch(`https://registry.npmjs.org/next/${version}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch Next.js ${version} version.`, {
        cause: res.statusText,
      })
    }

    targetPkgJson = await res.json()
    targetNextVersion = targetPkgJson.version
  }

  if (!targetPkgJson) {
    const nextPkgJson: Record<string, any> = {}
    try {
      const canary = await fetch('https://registry.npmjs.org/next/canary')
      nextPkgJson.canary = await canary.json()

      const rc = await fetch('https://registry.npmjs.org/next/rc')
      nextPkgJson.rc = await rc.json()

      const latest = await fetch('https://registry.npmjs.org/next/latest')
      nextPkgJson.latest = await latest.json()
    } catch (error) {
      throw new Error('Failed to fetch versions from npm registry.', {
        cause: error,
      })
    }

    const choices = [
      {
        title: 'Canary',
        value: 'canary',
        description: `Canary version of Next.js (v${nextPkgJson.canary.version})`,
      },
      {
        title: 'Latest',
        value: 'latest',
        description: `Latest version of Next.js (v${nextPkgJson.latest.version})`,
      },
    ]

    // If the version of rc is greater than latest, show rc as an option.
    if (compare(nextPkgJson.rc.version, nextPkgJson.latest.version, '>')) {
      choices.push({
        title: 'Release Candidate (RC)',
        value: 'rc',
        description: `Release Candidate of Next.js (v${nextPkgJson.rc.version})`,
      })
    }

    const { release } = await prompts({
      type: 'select',
      name: 'release',
      message: 'Which Next.js release do you want to upgrade to?',
      choices: choices,
      onState: onPromptState,
    })

    targetPkgJson = nextPkgJson[release]
    targetNextVersion = targetPkgJson.version
  }

  if (!targetNextVersion) {
    throw new Error('Failed to fetch the target Next.js version.')
  }

  const nextDependency = `next@${targetNextVersion}`
  const reactDependencies = [
    `react@${targetPkgJson.peerDependencies['react']}`,
    `react-dom@${targetPkgJson.peerDependencies['react-dom']}`,
  ]

  try {
    if (require.resolve('typescript')) {
      reactDependencies.push(
        `@types/react@${targetPkgJson.devDependencies['@types/react']}`,
        `@types/react-dom@${targetPkgJson.devDependencies['@types/react-dom']}`
      )
    }
  } catch {}

  const packageManager: PackageManager = getPkgManager(cwd)
  installPackage([nextDependency, ...reactDependencies], packageManager)

  console.log(`Upgrading your project to Next.js v${targetNextVersion}...\n`)

  await suggestCodemods(installedNextVersion, targetNextVersion)

  console.log(
    `\n${green('✔')} Your Next.js project has been upgraded successfully. ${bold('Time to ship! 🚢')}`
  )
}

async function getInstalledNextVersion(): Promise<string | null> {
  try {
    const installedNextPkgJsonPath = require.resolve('next/package.json', {
      paths: [cwd],
    })

    return require(installedNextPkgJsonPath).version
  } catch (error) {
    throw new Error('Failed to get installed Next.js version.', {
      cause: error,
    })
  }
}

async function suggestCodemods(
  initialNextVersion: string,
  targetNextVersion: string
): Promise<void> {
  const initialVersionIndex = CODEMOD_CHOICES.findIndex(
    (codemod) => compareVersions(codemod.version, initialNextVersion) > 0
  )
  if (initialVersionIndex === -1) {
    return
  }

  let targetNextVersionIndex = CODEMOD_CHOICES.findIndex(
    (codemod) => compareVersions(codemod.version, targetNextVersion) > 0
  )
  if (targetNextVersionIndex === -1) {
    targetNextVersionIndex = CODEMOD_CHOICES.length
  }

  const relevantCodemods = CODEMOD_CHOICES.slice(
    initialVersionIndex,
    targetNextVersionIndex
  )

  if (relevantCodemods.length === 0) {
    return
  }

  let codemodsString = `\nThe following ${blue('codemods')} are available for your upgrade:`
  relevantCodemods.forEach((codemod) => {
    codemodsString += `\n- ${codemod.title} ${gray(`(${codemod.value})`)}`
  })
  codemodsString += '\n'

  console.log(codemodsString)

  const responseCodemods = await prompts({
    type: 'confirm',
    name: 'apply',
    message: `Do you want to apply these codemods?`,
    initial: true,
    onState: onPromptState,
  })

  if (!responseCodemods.apply) {
    return
  }

  for (const codemod of relevantCodemods) {
    execSync(`npx @next/codemod@latest ${codemod.value} ${cwd} --force`, {
      stdio: 'inherit',
    })
  }
}
