import { writeFileSync } from 'fs'
import { getProjectDir } from '../lib/get-project-dir'
import { printAndExit } from '../server/lib/utils'
import loadConfig from '../server/config'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'
import {
  hasNecessaryDependencies,
  type MissingDependency,
} from '../lib/has-necessary-dependencies'
import { installDependencies } from '../lib/install-dependencies'
import type { NextConfigComplete } from '../server/config-shared'
import findUp from 'next/dist/compiled/find-up'
import { findPagesDir } from '../lib/find-pages-dir'
import { verifyTypeScriptSetup } from '../lib/verify-typescript-setup'
import path from 'path'
import spawn from 'next/dist/compiled/cross-spawn'

export interface NextTestOptions {
  testRunner?: string
}

export const SUPPORTED_TEST_RUNNERS_LIST = ['playwright'] as const
export type SupportedTestRunners = (typeof SUPPORTED_TEST_RUNNERS_LIST)[number]

const requiredPackagesByTestRunner: {
  [k in SupportedTestRunners]: MissingDependency[]
} = {
  playwright: [
    { file: 'playwright', pkg: '@playwright/test', exportsRestrict: false },
  ],
}

export async function nextTest(
  directory?: string,
  testRunnerArgs: string[] = [],
  options: NextTestOptions = {}
) {
  // The following mess is in order to support an existing Next.js CLI pattern of optionally, passing a project `directory` as the first argument to execute the command on.
  // This is problematic for `next test` because as a wrapper around a test runner's `test` command, it needs to pass through any additional arguments and options.
  // Thus, `directory` could either be a valid Next.js project directory (that the user intends to run `next test` on), or it is the first argument for the test runner.
  // Unfortunately, since many test runners support passing a path (to a test file or directory containing test files), we must check if `directory` is both a valid path and a valid Next.js project.

  let baseDir, nextConfig

  try {
    // if directory is `undefined` or a valid path this will succeed.
    baseDir = getProjectDir(directory, false)
  } catch (err) {
    // if that failed, then `directory` is not a valid path, so it must have meant to be the first item for `testRunnerArgs`
    // @ts-expect-error directory is a string here since `getProjectDir` will succeed if its undefined
    testRunnerArgs.unshift(directory)
    // intentionally set baseDir to the resolved '.' path
    baseDir = getProjectDir()
  }

  try {
    // but, `baseDir` might not be a Next.js project directory, it could be a path-like argument for the test runner (i.e. `playwright test test/foo.spec.js`)
    // if this succeeds, it means that `baseDir` is a Next.js project directory
    nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir)
  } catch (err) {
    // if it doesn't, then most likely `baseDir` is not a Next.js project directory
    // @ts-expect-error directory is a string here since `getProjectDir` will succeed if its undefined
    testRunnerArgs.unshift(directory)
    // intentionally set baseDir to the resolved '.' path
    baseDir = getProjectDir()
    nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir) // let this error bubble up if the `basePath` is still not a valid Next.js project
  }

  // set the test runner. priority is CLI option > next config > default 'playwright'
  const configuredTestRunner =
    options?.testRunner ?? // --test-runner='foo'
    nextConfig.experimental.defaultTestRunner ?? // { experimental: { defaultTestRunner: 'foo' }}
    'playwright'

  if (!nextConfig.experimental.testProxy) {
    return printAndExit(
      `\`next experimental-test\` requires the \`experimental.testProxy: true\` configuration option.`
    )
  }

  // execute test runner specific function
  switch (configuredTestRunner) {
    case 'playwright':
      return runPlaywright(baseDir, nextConfig, testRunnerArgs)
    default:
      return printAndExit(
        `Test runner ${configuredTestRunner} is not supported.`
      )
  }
}

async function checkRequiredDeps(
  baseDir: string,
  testRunner: SupportedTestRunners
) {
  const deps = hasNecessaryDependencies(
    baseDir,
    requiredPackagesByTestRunner[testRunner]
  )
  if (deps.missing.length > 0) {
    await installDependencies(baseDir, deps.missing, true)

    const playwright = spawn(
      path.join(baseDir, 'node_modules', '.bin', 'playwright'),
      ['install'],
      {
        cwd: baseDir,
        shell: false,
        stdio: 'inherit',
        env: {
          ...process.env,
        },
      }
    )

    return new Promise((resolve, reject) => {
      playwright.on('close', (c) => resolve(c))
      playwright.on('error', (err) => reject(err))
    })
  }
}

async function runPlaywright(
  baseDir: string,
  nextConfig: NextConfigComplete,
  testRunnerArgs: string[]
) {
  await checkRequiredDeps(baseDir, 'playwright')

  const playwrightConfigFile = await findUp(
    ['playwright.config.js', 'playwright.config.ts'],
    {
      cwd: baseDir,
    }
  )

  if (!playwrightConfigFile) {
    const { pagesDir, appDir } = findPagesDir(baseDir)

    const { version: typeScriptVersion } = await verifyTypeScriptSetup({
      dir: baseDir,
      distDir: nextConfig.distDir,
      intentDirs: [pagesDir, appDir].filter(Boolean) as string[],
      typeCheckPreflight: false,
      tsconfigPath: nextConfig.typescript.tsconfigPath,
      disableStaticImages: nextConfig.images.disableStaticImages,
      hasAppDir: !!appDir,
      hasPagesDir: !!pagesDir,
      isolatedDevBuild: nextConfig.experimental.isolatedDevBuild,
    })

    const isUsingTypeScript = !!typeScriptVersion

    const playwrightConfigFilename = isUsingTypeScript
      ? 'playwright.config.ts'
      : 'playwright.config.js'

    writeFileSync(
      path.join(baseDir, playwrightConfigFilename),
      defaultPlaywrightConfig(isUsingTypeScript)
    )

    return printAndExit(
      `Successfully generated ${playwrightConfigFilename}. Create your first test and then run \`next experimental-test\`.`,
      0
    )
  } else {
    const playwright = spawn(
      path.join(baseDir, 'node_modules', '.bin', 'playwright'),
      ['test', ...testRunnerArgs],
      {
        cwd: baseDir,
        shell: false,
        stdio: 'inherit',
        env: {
          ...process.env,
        },
      }
    )
    return new Promise((resolve, reject) => {
      playwright.on('close', (c) => resolve(c))
      playwright.on('error', (err) => reject(err))
    })
  }
}

function defaultPlaywrightConfig(typescript: boolean) {
  const comment = `/*
 * Specify any additional Playwright config options here.
 * They will be merged with Next.js' default Playwright config.
 * You can access the default config by importing \`defaultPlaywrightConfig\` from \`'next/experimental/testmode/playwright'\`.
 */`
  return typescript
    ? `import { defineConfig } from 'next/experimental/testmode/playwright';\n\n${comment}\nexport default defineConfig({});`
    : `const { defineConfig } = require('next/experimental/testmode/playwright');\n\n${comment}\nmodule.exports = defineConfig({});`
}
