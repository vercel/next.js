import { existsSync } from 'fs'
import { getProjectDir } from '../lib/get-project-dir'
import { printAndExit } from '../server/lib/utils'
import loadConfig from '../server/config'
import { PHASE_PRODUCTION_BUILD } from '../api/constants'
import {
  hasNecessaryDependencies,
  type MissingDependency,
} from '../lib/has-necessary-dependencies'
import { installDependencies } from '../lib/install-dependencies'
import type { NextConfigComplete } from '../server/config-shared'
import findUp from 'next/dist/compiled/find-up'

export interface NextTestOptions {}

export const SUPPORTED_TEST_RUNNERS_LIST = ['playwright'] as const
export type SUPPORTED_TEST_RUNNERS =
  (typeof SUPPORTED_TEST_RUNNERS_LIST)[number]

const requiredPackagesByTestRunner: {
  [k in SUPPORTED_TEST_RUNNERS]: MissingDependency[]
} = {
  playwright: [
    { file: 'playwright', pkg: 'playwright', exportsRestrict: false },
  ],
}

function isSupportedTestRunner(
  testRunner: string
): testRunner is SUPPORTED_TEST_RUNNERS {
  return testRunner in requiredPackagesByTestRunner
}

export async function nextTest(
  directory?: string,
  testRunner?: string,
  options?: unknown
) {
  // get execution directory
  const baseDir = getProjectDir(directory)

  // Check if the directory exists
  if (!existsSync(baseDir)) {
    printAndExit(`> No such directory exists as the project root: ${baseDir}`)
  }

  // find nextConfig
  const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir)

  // set the test runner. priority is CLI option > next config > default 'playwright'
  const configuredTestRunner =
    testRunner ?? nextConfig.experimental.defaultTestRunner ?? 'playwright'

  if (!isSupportedTestRunner(configuredTestRunner)) {
    return printAndExit(`Test runner ${configuredTestRunner} is not supported.`)
  }

  switch (configuredTestRunner) {
    case 'playwright':
      return runPlaywright(baseDir, nextConfig)
    default:
      return printAndExit(
        `Test runner ${configuredTestRunner} is not supported.`
      )
  }
}

async function checkRequiredDeps(
  baseDir: string,
  testRunner: SUPPORTED_TEST_RUNNERS
) {
  const deps = await hasNecessaryDependencies(
    baseDir,
    requiredPackagesByTestRunner[testRunner]
  )
  if (deps.missing.length > 0) {
    await installDependencies(baseDir, deps.missing, true)
  }
}

async function runPlaywright(baseDir: string, nextConfig: NextConfigComplete) {
  await checkRequiredDeps(baseDir, 'playwright')

  const playwrightConfigFiles = ['playwright.config.js']

  const playwrightConfigFile = await findUp(['playwright.config.js'], {
    cwd: baseDir,
  })
}
