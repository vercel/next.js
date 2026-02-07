/* eslint-disable import/no-extraneous-dependencies */
import retry from 'async-retry'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { cyan, green, red } from 'picocolors'
import type { RepoInfo } from './helpers/examples'
import {
  downloadAndExtractExample,
  downloadAndExtractRepo,
  existsInRepo,
  getRepoInfo,
  hasRepo,
} from './helpers/examples'
import type { PackageManager } from './helpers/get-pkg-manager'
import { tryGitInit } from './helpers/git'
import { install } from './helpers/install'
import { isFolderEmpty } from './helpers/is-folder-empty'
import { getOnline } from './helpers/is-online'
import { isWriteable } from './helpers/is-writeable'
import { runTypegen } from './helpers/typegen'

import type { Bundler, TemplateMode, TemplateType } from './templates'
import { getTemplateFile, installTemplate } from './templates'

export class DownloadError extends Error {}

export async function createApp({
  appPath,
  packageManager,
  example,
  examplePath,
  typescript,
  tailwind,
  eslint,
  biome,
  app,
  srcDir,
  importAlias,
  skipInstall,
  empty,
  api,
  bundler,
  disableGit,
  reactCompiler,
}: {
  appPath: string
  packageManager: PackageManager
  example?: string
  examplePath?: string
  typescript: boolean
  tailwind: boolean
  eslint: boolean
  biome: boolean
  app: boolean
  srcDir: boolean
  importAlias: string
  skipInstall: boolean
  empty: boolean
  api?: boolean
  bundler: Bundler
  disableGit?: boolean
  reactCompiler: boolean
}): Promise<void> {
  let repoInfo: RepoInfo | undefined
  const mode: TemplateMode = typescript ? 'ts' : 'js'
  const template: TemplateType = `${app ? 'app' : 'default'}${tailwind ? '-tw' : ''}${empty ? '-empty' : ''}`

  if (example) {
    let repoUrl: URL | undefined

    try {
      repoUrl = new URL(example)
    } catch (error: unknown) {
      const err = error as Error
      // TypeError is thrown when the URL is invalid. Equivalent of doing `err.code !== "ERR_INVALID_URL"` in Node.js
      if (!(err instanceof TypeError)) {
        console.error(error)
        process.exit(1)
      }
    }

    if (repoUrl) {
      if (repoUrl.origin !== 'https://github.com') {
        console.error(
          `Invalid URL: ${red(
            `"${example}"`
          )}. Only GitHub repositories are supported. Please use a GitHub URL and try again.`
        )
        process.exit(1)
      }

      repoInfo = await getRepoInfo(repoUrl, examplePath)

      if (!repoInfo) {
        console.error(
          `Found invalid GitHub URL: ${red(
            `"${example}"`
          )}. Please fix the URL and try again.`
        )
        process.exit(1)
      }

      const found = await hasRepo(repoInfo)

      if (!found) {
        console.error(
          `Could not locate the repository for ${red(
            `"${example}"`
          )}. Please check that the repository exists and try again.`
        )
        process.exit(1)
      }
    } else if (example !== '__internal-testing-retry') {
      const found = await existsInRepo(example)

      if (!found) {
        console.error(
          `Could not locate an example named ${red(
            `"${example}"`
          )}. It could be due to the following:\n`,
          `1. Your spelling of example ${red(
            `"${example}"`
          )} might be incorrect.\n`,
          `2. You might not be connected to the internet or you are behind a proxy.`
        )
        process.exit(1)
      }
    }
  }

  const root = resolve(appPath)

  if (!(await isWriteable(dirname(root)))) {
    console.error(
      'The application path is not writable, please check folder permissions and try again.'
    )
    console.error(
      'It is likely you do not have write permissions for this folder.'
    )
    process.exit(1)
  }

  const appName = basename(root)

  mkdirSync(root, { recursive: true })
  if (!isFolderEmpty(root, appName)) {
    process.exit(1)
  }

  const useYarn = packageManager === 'yarn'
  const isOnline = !useYarn || (await getOnline())
  const originalDirectory = process.cwd()

  console.log(`Creating a new Next.js app in ${green(root)}.`)
  console.log()

  process.chdir(root)

  const packageJsonPath = join(root, 'package.json')
  let hasPackageJson = false

  if (example) {
    /**
     * If an example repository is provided, clone it.
     */
    try {
      if (repoInfo) {
        const repoInfo2 = repoInfo
        console.log(
          `Downloading files from repo ${cyan(
            example
          )}. This might take a moment.`
        )
        console.log()
        await retry(() => downloadAndExtractRepo(root, repoInfo2), {
          retries: 3,
        })
      } else {
        console.log(
          `Downloading files for example ${cyan(
            example
          )}. This might take a moment.`
        )
        console.log()
        await retry(() => downloadAndExtractExample(root, example), {
          retries: 3,
        })
      }
    } catch (reason) {
      function isErrorLike(err: unknown): err is { message: string } {
        return (
          typeof err === 'object' &&
          err !== null &&
          typeof (err as { message?: unknown }).message === 'string'
        )
      }
      throw new DownloadError(
        isErrorLike(reason) ? reason.message : reason + ''
      )
    }
    // Copy `.gitignore` if the application did not provide one
    const ignorePath = join(root, '.gitignore')
    if (!existsSync(ignorePath)) {
      copyFileSync(
        getTemplateFile({ template, mode, file: 'gitignore' }),
        ignorePath
      )
    }

    // Copy `next-env.d.ts` to any example that is typescript
    const tsconfigPath = join(root, 'tsconfig.json')
    if (existsSync(tsconfigPath)) {
      copyFileSync(
        getTemplateFile({ template, mode: 'ts', file: 'next-env.d.ts' }),
        join(root, 'next-env.d.ts')
      )
    }

    hasPackageJson = existsSync(packageJsonPath)
    if (!skipInstall && hasPackageJson) {
      console.log('Installing packages. This might take a couple of minutes.')
      console.log()

      await install(packageManager, isOnline)
      console.log()
      try {
        console.log()
        await runTypegen(packageManager)
        console.log()
      } catch (err) {
        // Best effort: do not fail app creation if typegen fails
        console.error('Error running typegen:', err)
      }
    }
  } else {
    /**
     * If an example repository is not provided for cloning, proceed
     * by installing from a template.
     */
    await installTemplate({
      appName,
      root,
      template: api ? 'app-api' : template,
      mode,
      packageManager,
      isOnline,
      tailwind,
      eslint,
      biome,
      srcDir,
      importAlias,
      skipInstall,
      bundler,
      reactCompiler,
    })
  }

  if (disableGit) {
    console.log('Skipping git initialization.')
    console.log()
  } else if (tryGitInit(root)) {
    console.log('Initialized a git repository.')
    console.log()
  }

  let cdpath: string
  if (join(originalDirectory, appName) === appPath) {
    cdpath = appName
  } else {
    cdpath = appPath
  }

  console.log(`${green('Success!')} Created ${appName} at ${appPath}`)

  if (hasPackageJson) {
    console.log('Inside that directory, you can run several commands:')
    console.log()
    console.log(cyan(`  ${packageManager} ${useYarn ? '' : 'run '}dev`))
    console.log('    Starts the development server.')
    console.log()
    console.log(cyan(`  ${packageManager} ${useYarn ? '' : 'run '}build`))
    console.log('    Builds the app for production.')
    console.log()
    console.log(cyan(`  ${packageManager} start`))
    console.log('    Runs the built app in production mode.')
    console.log()
    console.log('We suggest that you begin by typing:')
    console.log()
    console.log(cyan('  cd'), cdpath)
    console.log(`  ${cyan(`${packageManager} ${useYarn ? '' : 'run '}dev`)}`)
  }
  console.log()
}
