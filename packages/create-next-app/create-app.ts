/* eslint-disable import/no-extraneous-dependencies */
import retry from 'async-retry'
import chalk from 'chalk'
import cpy from 'cpy'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  downloadAndExtractExample,
  downloadAndExtractRepo,
  getRepoInfo,
  hasExample,
  hasRepo,
  RepoInfo,
} from './helpers/examples'
import { makeDir } from './helpers/make-dir'
import { tryGitInit } from './helpers/git'
import { install } from './helpers/install'
import { isFolderEmpty } from './helpers/is-folder-empty'
import { getOnline } from './helpers/is-online'
import { shouldUseYarn } from './helpers/should-use-yarn'
import { isWriteable } from './helpers/is-writeable'

export class DownloadError extends Error {}

export async function createApp({
  appPath,
  useNpm,
  example,
  examplePath,
}: {
  appPath: string
  useNpm: boolean
  example?: string
  examplePath?: string
}): Promise<void> {
  let repoInfo: RepoInfo | undefined

  if (example) {
    let repoUrl: URL | undefined

    try {
      repoUrl = new URL(example)
    } catch (error) {
      if (error.code !== 'ERR_INVALID_URL') {
        console.error(error)
        process.exit(1)
      }
    }

    if (repoUrl) {
      if (repoUrl.origin !== 'https://github.com') {
        console.error(
          `Invalid URL: ${chalk.red(
            `"${example}"`
          )}. Only GitHub repositories are supported. Please use a GitHub URL and try again.`
        )
        process.exit(1)
      }

      repoInfo = await getRepoInfo(repoUrl, examplePath)

      if (!repoInfo) {
        console.error(
          `Found invalid GitHub URL: ${chalk.red(
            `"${example}"`
          )}. Please fix the URL and try again.`
        )
        process.exit(1)
      }

      const found = await hasRepo(repoInfo)

      if (!found) {
        console.error(
          `Could not locate the repository for ${chalk.red(
            `"${example}"`
          )}. Please check that the repository exists and try again.`
        )
        process.exit(1)
      }
    } else if (example !== '__internal-testing-retry') {
      const found = await hasExample(example)

      if (!found) {
        console.error(
          `Could not locate an example named ${chalk.red(
            `"${example}"`
          )}. Please check your spelling and try again.`
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

  await makeDir(root)
  if (!isFolderEmpty(root, appName)) {
    process.exit(1)
  }

  const useYarn = useNpm ? false : shouldUseYarn()
  const isOnline = !useYarn || (await getOnline())
  const originalDirectory = process.cwd()

  const displayedCommand = useYarn ? 'yarn' : 'npm'
  console.log(`Creating a new Next.js app in ${chalk.green(root)}.`)
  console.log()

  await makeDir(root)
  process.chdir(root)

  if (example) {
    try {
      if (repoInfo) {
        const repoInfo2 = repoInfo
        console.log(
          `Downloading files from repo ${chalk.cyan(
            example
          )}. This might take a moment.`
        )
        console.log()
        await retry(() => downloadAndExtractRepo(root, repoInfo2), {
          retries: 3,
        })
      } else {
        console.log(
          `Downloading files for example ${chalk.cyan(
            example
          )}. This might take a moment.`
        )
        console.log()
        await retry(() => downloadAndExtractExample(root, example), {
          retries: 3,
        })
      }
    } catch (reason) {
      throw new DownloadError(reason)
    }
    // Copy our default `.gitignore` if the application did not provide one
    const ignorePath = path.join(root, '.gitignore')
    if (!fs.existsSync(ignorePath)) {
      fs.copyFileSync(
        path.join(__dirname, 'templates', 'default', 'gitignore'),
        ignorePath
      )
    }

    console.log('Installing packages. This might take a couple of minutes.')
    console.log()

    await install(root, null, { useYarn, isOnline })
    console.log()
  } else {
    const packageJson = {
      name: appName,
      version: '0.1.0',
      private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    }
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify(packageJson, null, 2) + os.EOL
    )

    console.log(
      `Installing ${chalk.cyan('react')}, ${chalk.cyan(
        'react-dom'
      )}, and ${chalk.cyan('next')} using ${displayedCommand}...`
    )
    console.log()

    await install(root, ['react', 'react-dom', 'next'], { useYarn, isOnline })
    console.log()

    await cpy('**', root, {
      parents: true,
      cwd: path.join(__dirname, 'templates', 'default'),
      rename: (name) => {
        switch (name) {
          case 'gitignore': {
            return '.'.concat(name)
          }
          // README.md is ignored by webpack-asset-relocator-loader used by ncc:
          // https://github.com/zeit/webpack-asset-relocator-loader/blob/e9308683d47ff507253e37c9bcbb99474603192b/src/asset-relocator.js#L227
          case 'README-template.md': {
            return 'README.md'
          }
          default: {
            return name
          }
        }
      },
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

  console.log(`${chalk.green('Success!')} Created ${appName} at ${appPath}`)
  console.log('Inside that directory, you can run several commands:')
  console.log()
  console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}dev`))
  console.log('    Starts the development server.')
  console.log()
  console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`))
  console.log('    Builds the app for production.')
  console.log()
  console.log(chalk.cyan(`  ${displayedCommand} start`))
  console.log('    Runs the built app in production mode.')
  console.log()
  console.log('We suggest that you begin by typing:')
  console.log()
  console.log(chalk.cyan('  cd'), cdpath)
  console.log(
    `  ${chalk.cyan(`${displayedCommand} ${useYarn ? '' : 'run '}dev`)}`
  )
  console.log()
}
