import { promises } from 'fs'
import { bold, cyan, red } from './picocolors'

import path from 'path'
import { hasNecessaryDependencies } from './has-necessary-dependencies'
import type { NecessaryDependencies } from './has-necessary-dependencies'
import { fileExists, FileType } from './file-exists'
import * as Log from '../build/output/log'
import { getPkgManager } from './helpers/get-pkg-manager'

const PARTYTOWN_PACKAGE = '@qwik.dev/partytown'
const LEGACY_PARTYTOWN_PACKAGE = '@builder.io/partytown'

function getPartytownDependencies(
  dir: string,
  partytownPackage: string
): NecessaryDependencies {
  return hasNecessaryDependencies(dir, [
    {
      file: partytownPackage,
      pkg: partytownPackage,
      exportsRestrict: false,
    },
  ])
}

async function missingDependencyError(dir: string) {
  const packageManager = getPkgManager(dir)

  throw new Error(
    bold(
      red(
        "It looks like you're trying to use Partytown with next/script but do not have the required package(s) installed."
      )
    ) +
      '\n\n' +
      bold(`Please install Partytown by running:`) +
      '\n\n' +
      `\t${bold(
        cyan(
          (packageManager === 'yarn'
            ? 'yarn add --dev'
            : packageManager === 'pnpm'
              ? 'pnpm install --save-dev'
              : 'npm install --save-dev') + ` ${PARTYTOWN_PACKAGE}`
        )
      )}` +
      '\n\n' +
      bold(
        `If you are not trying to use Partytown, please disable the experimental ${cyan(
          '"nextScriptWorkers"'
        )} flag in next.config.js.`
      ) +
      '\n'
  )
}

async function copyPartytownStaticFiles(
  deps: NecessaryDependencies,
  partytownPackage: string,
  staticDir: string
) {
  const partytownLibDir = path.join(staticDir, '~partytown')
  const hasPartytownLibDir = await fileExists(
    partytownLibDir,
    FileType.Directory
  )

  if (hasPartytownLibDir) {
    await promises.rm(partytownLibDir, { recursive: true, force: true })
  }

  const { copyLibFiles } = await Promise.resolve(
    require(path.join(deps.resolved.get(partytownPackage)!, '../utils'))
  )

  await copyLibFiles(partytownLibDir)
}

export async function verifyPartytownSetup(
  dir: string,
  targetDir: string
): Promise<void> {
  let partytownPackage = PARTYTOWN_PACKAGE
  let partytownDeps = getPartytownDependencies(dir, partytownPackage)

  if (partytownDeps.missing?.length > 0) {
    const legacyPartytownDeps = getPartytownDependencies(
      dir,
      LEGACY_PARTYTOWN_PACKAGE
    )

    if (legacyPartytownDeps.missing?.length > 0) {
      await missingDependencyError(dir)
    }

    partytownPackage = LEGACY_PARTYTOWN_PACKAGE
    partytownDeps = legacyPartytownDeps
  }

  try {
    await copyPartytownStaticFiles(partytownDeps, partytownPackage, targetDir)
  } catch (err) {
    Log.warn(
      `Partytown library files could not be copied to the static directory. Please ensure that ${bold(
        cyan(partytownPackage)
      )} is installed as a dependency.`
    )
  }
}
