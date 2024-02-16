/* eslint-disable import/no-extraneous-dependencies */
import retry from 'async-retry'
import { red, green, cyan } from 'picocolors'
import fs from 'fs'
import path from 'path'
import type { RepoInfo } from './helpers/examples'
import {
  downloadAndExtractExample,
  downloadAndExtractRepo,
  getRepoInfo,
  existsInRepo,
  hasRepo,
} from './helpers/examples'
import { tryGitInit } from './helpers/git'
import { install } from './helpers/install'
import { isFolderEmpty } from './helpers/is-folder-empty'
import { getOnline } from './helpers/is-online'
import { isWriteable } from './helpers/is-writeable'
import type { PackageManager } from './helpers/get-pkg-manager'

import type { TemplateMode, TemplateType } from './templates'
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
  appRouter,
  srcDir,
  importAlias,
}: {
  appPath: string
  packageManager: PackageManager
  example?: string
  examplePath?: string
  typescript: boolean
  tailwind: boolean
  eslint: boolean
  appRouter: boolean
  srcDir: boolean
  importAlias: string
}): Promise<void> {
  let repoInfo: RepoInfo | undefined
  const mode: TemplateMode = typescript ? 'ts' : 'js'
  const template: TemplateType = appRouter
    ? tailwind
      ? 'app-tw'
      : 'app'
    : tailwind
    ? 'default-tw'
    : 'default'

  if (example) {
    let repoUrl: URL | undefined

    try {
      repoUrl = new URL(example)
    } catch (error: unknown) {
      const err = error as Error & { code: string | undefined }
      if (err.code !== 'ERR_INVALID_URL') {
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

  const root = path.resolve(appPath)

  if (!(await isWriteable(path.dirname(root)))) {
    console.error(
      'The application path is not writable, please check folder permissions and try again.'
    )
    console.error(
      'It is likely you do not have write permissions for this folder.'
    )
    process.exit(1)
  }

  const appName = path.basename(root)

  fs.mkdirSync(root, { recursive: true })
  if (!isFolderEmpty(root, appName)) {
    process.exit(1)
  }

  const useYarn = packageManager === 'yarn'
  const isOnline = !useYarn || (await getOnline())
  const originalDirectory = process.cwd()

  console.log(`Creating a new Next.js app in ${green(root)}.`)
  console.log()

  process.chdir(root)

  const packageJsonPath = path.join(root, 'package.json')
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
    const ignorePath = path.join(root, '.gitignore')
    if (!fs.existsSync(ignorePath)) {
      fs.copyFileSync(
        getTemplateFile({ template, mode, file: 'gitignore' }),
        ignorePath
      )
    }

    // Copy `next-env.d.ts` to any example that is typescript
    const tsconfigPath = path.join(root, 'tsconfig.json')
    if (fs.existsSync(tsconfigPath)) {
      fs.copyFileSync(
        getTemplateFile({ template, mode: 'ts', file: 'next-env.d.ts' }),
        path.join(root, 'next-env.d.ts')
      )
    }

    hasPackageJson = fs.existsSync(packageJsonPath)
    if (hasPackageJson) {
      console.log('Installing packages. This might take a couple of minutes.')
      console.log()

      await install(packageManager, isOnline)
      console.log()
    }
  } else {
    /**
     * If an example repository is not provided for cloning, proceed
     * by installing from a template.
     */
    await installTemplate({
      appName,
      root,
      template,
      mode,
      packageManager,
      isOnline,
      tailwind,
      eslint,
      srcDir,
      importAlias,
    })
  }

  if (tryGitInit(root)) {
    console.log('Initialized a git repository.')
    console.log()
  }

  let cdpath: string
  if (path.join(originalDirectory, appName) === appPath) {
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
