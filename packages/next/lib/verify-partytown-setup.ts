import { promises } from 'fs'
import chalk from 'next/dist/compiled/chalk'

import path from 'path'
import {
  hasNecessaryDependencies,
  NecessaryDependencies,
} from './has-necessary-dependencies'
import { isYarn } from './is-yarn'
import { fileExists } from './file-exists'
import { FatalError } from './fatal-error'
import { recursiveDelete } from './recursive-delete'
import * as Log from '../build/output/log'

async function missingDependencyError(dir: string) {
  throw new FatalError(
    chalk.bold.red(
      "It looks like you're trying to use Partytown with next/script but do not have the required package(s) installed."
    ) +
      '\n\n' +
      chalk.bold(`Please install Partytown by running:`) +
      '\n\n' +
      `\t${chalk.bold.cyan(
        (await isYarn(dir))
          ? 'yarn add @builder.io/partytown'
          : 'npm install @builder.io/partytown'
      )}` +
      '\n\n' +
      chalk.bold(
        `If you are not trying to use Partytown, please disable the experimental ${chalk.cyan(
          '"optimizeScripts.enablePartytown"'
        )} flag in next.config.js.`
      ) +
      '\n'
  )
}

async function copyPartytownStaticFiles(
  publicDir: string,
  deps: NecessaryDependencies
) {
  const partytownLibDir = path.join(publicDir, '~partytown')
  const hasPartytownLibDir = await fileExists(partytownLibDir, 'directory')

  if (hasPartytownLibDir) {
    await recursiveDelete(partytownLibDir)
    await promises.rmdir(partytownLibDir)
  }

  const { copyLibFiles } = await Promise.resolve(
    require(path.join(deps.resolved.get('@builder.io/partytown')!, '../utils'))
  )

  await copyLibFiles(path.join(publicDir, '~partytown'))
  Log.info(
    `Partytown has been enabled for next/script. The ~partytown directory was ${
      hasPartytownLibDir ? 'deleted and re-created' : 'created'
    } for you in the public folder with all the necessary static files.`
  )
}

export async function verifyPartytownSetup(
  dir: string,
  publicDir: string
): Promise<void> {
  try {
    const hasPublicDir = await fileExists(publicDir)

    const partytownDeps: NecessaryDependencies = await hasNecessaryDependencies(
      dir,
      [{ file: '@builder.io/partytown', pkg: '@builder.io/partytown' }]
    )

    if (partytownDeps.missing?.length > 0) {
      await missingDependencyError(dir)
    } else {
      if (hasPublicDir) {
        try {
          await copyPartytownStaticFiles(publicDir, partytownDeps)
        } catch (err) {
          Log.warn(
            `Partytown library files could not be copied to the public folder. Please ensure that ${chalk.bold.cyan(
              '@builder.io/partytown'
            )} is installed as a dependency.`
          )
        }
      } else {
        Log.warn(
          'Public directory not found. To use Partytown, please create a `public` folder in the root directoy to serve its static files. https://nextjs.org/docs/basic-features/static-file-serving'
        )
      }
    }
  } catch (err) {
    // Don't show a stack trace when there is an error due to missing dependencies
    if (err instanceof FatalError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
