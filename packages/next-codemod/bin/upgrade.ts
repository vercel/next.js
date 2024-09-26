import prompts from 'prompts'
import { green, bold } from 'picocolors'
import { compare, validateStrict } from 'compare-versions'
import { getPkgManager, installPackage } from '../lib/handle-package'
import { CODEMOD_CHOICES } from '../lib/utils'
import { onPromptState } from './next-codemod'
import { runTransform } from './transform'

type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'
type Version = 'canary' | 'rc' | 'latest' | string

const cwd: string = process.cwd()

export async function runUpgrade(version?: Version): Promise<void> {
  const installedNextVersion = await getInstalledNextVersion()

  console.log()
  console.log(`Current Next.js version: v${installedNextVersion}`)
  console.log()

  let targetPkgJson
  let targetNextVersion = ''

  const isValidVersion = validateStrict(version)
  const isTag = ['canary', 'rc', 'latest'].includes(version)

  if (version && !isValidVersion && !isTag) {
    console.log(
      `"${version}" is an invalid version syntax. See "https://www.npmjs.com/package/next?activeTab=versions".`
    )
    console.log()
  }

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
    const { release } = await prompts({
      type: 'select',
      name: 'release',
      message: 'Which Next.js release do you want to upgrade to?',
      choices: [
        {
          title: 'Canary',
          value: 'canary',
          description:
            'Experimental version including the latest features and improvements.',
        },
        {
          title: 'Latest',
          value: 'latest',
          description: 'Latest stable version of Next.js.',
        },
        {
          title: 'Release Candidate (RC)',
          value: 'rc',
          description: 'Release Candidate of Next.js.',
        },
      ],
      onState: onPromptState,
    })

    let nextPkgJson
    try {
      const res = await fetch(`https://registry.npmjs.org/next/${release}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch Next.js ${release} version.`, {
          cause: res.statusText,
        })
      }

      nextPkgJson = await res.json()
    } catch (error) {
      throw new Error('Failed to fetch versions from npm registry.', {
        cause: error,
      })
    }

    if (!nextPkgJson.version) {
      throw new Error(`Failed to fetch the target Next.js ${release} version.`)
    }

    if (
      release === 'rc' &&
      compare(nextPkgJson.version, installedNextVersion, '<=')
    ) {
      console.log(
        `Current version v${installedNextVersion} is newer than the latest Release Candidate v${nextPkgJson.version}.`
      )
      return
    }

    targetPkgJson = nextPkgJson
    targetNextVersion = nextPkgJson.version
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

  console.log(`Upgrading your project to Next.js v${targetNextVersion}...`)

  const packageManager: PackageManager = getPkgManager(cwd)
  await installPackage(
    [nextDependency, ...reactDependencies],
    packageManager,
    cwd
  )

  await suggestCodemods(installedNextVersion, targetNextVersion)

  console.log(
    `\n${green('✔')} Your Next.js project has been upgraded successfully. ${bold('Time to ship! 🚢')}`
  )
}

async function getInstalledNextVersion(): Promise<string | null> {
  try {
    return require(
      require.resolve('next/package.json', {
        paths: [cwd],
      })
    ).version
  } catch (error) {
    throw new Error('Failed to get the installed Next.js version.', {
      cause: error,
    })
  }
}

async function suggestCodemods(
  initialNextVersion: string,
  targetNextVersion: string
): Promise<void> {
  const initialVersionIndex = CODEMOD_CHOICES.findIndex((codemod) =>
    compare(codemod.version, initialNextVersion, '>')
  )
  if (initialVersionIndex === -1) {
    console.log('No codemods available for your upgrade.')
    return
  }

  let targetNextVersionIndex = CODEMOD_CHOICES.findIndex((codemod) =>
    compare(codemod.version, targetNextVersion, '>')
  )
  if (targetNextVersionIndex === -1) {
    targetNextVersionIndex = CODEMOD_CHOICES.length
  }

  const relevantCodemods = CODEMOD_CHOICES.slice(
    initialVersionIndex,
    targetNextVersionIndex
  )

  if (relevantCodemods.length === 0) {
    console.log('No codemods available for your upgrade.')
    return
  }

  // returns the "value" property of the selected codemods
  const { selectedCodeMods } = await prompts({
    type: 'multiselect',
    name: 'selectedCodeMods',
    message: 'Select the codemods you want to apply.',
    choices: relevantCodemods,
    onState: onPromptState,
  })

  if (!selectedCodeMods) {
    console.log('No codemods selected. Exiting.')
    return
  }

  for (const codemod of selectedCodeMods) {
    await runTransform(codemod, cwd, {
      force: true,
    })
  }
}
