// @ts-check
import fs from 'fs/promises'
import execa from 'execa'
import { createRequire } from 'module'
import path from 'path'
import { getDiffRevision, getGitInfo } from './git-info.mjs'

const require = createRequire(import.meta.url)
const glob = require('glob')
const {
  getTestFilterFromManifest,
  mergeManifests,
} = require('../test/get-test-filter')

const DEFAULT_DEPLOY_TESTS_MANIFEST_PATH = 'test/deploy-tests-manifest.json'
const TEST_FILE_REGEX = /^test\/.*?\.test\.(js|ts|tsx)$/

function normalizePath(file) {
  return file.replace(/\\/g, '/')
}

function getExcludedCases(suite = {}) {
  return new Set([...(suite.failed ?? []), ...(suite.flakey ?? [])])
}

function getExternalTestsFilterPaths() {
  const externalTestsFilters =
    process.env.NEXT_EXTERNAL_TESTS_FILTERS ??
    DEFAULT_DEPLOY_TESTS_MANIFEST_PATH

  const manifestPaths = new Map()

  for (const manifestPath of externalTestsFilters.split(',')) {
    if (!manifestPath.trim()) {
      continue
    }

    const absolutePath = path.resolve(process.cwd(), manifestPath)
    const repoRelativePath = normalizePath(
      path.relative(process.cwd(), absolutePath)
    )

    manifestPaths.set(repoRelativePath, {
      absolutePath,
      repoRelativePath,
    })
  }

  return [...manifestPaths.values()]
}

function getDeployTestsFromManifest(manifest) {
  const testFilter = getTestFilterFromManifest(manifest)
  if (!testFilter) {
    return []
  }

  const tests = glob
    .sync('test/e2e/**/*.test.{js,ts,tsx}', {
      cwd: process.cwd(),
      ignore: '**/node_modules/**',
      nodir: true,
    })
    .map((file) => ({ file: normalizePath(file), excludedCases: [] }))

  return testFilter(tests).map((test) => test.file)
}

export function getDeployManifestChangedTests(
  currentManifest,
  previousManifest
) {
  if (!currentManifest) {
    return []
  }

  const previousVersion2Manifest = previousManifest ?? {
    version: 2,
    suites: {},
    rules: { include: [], exclude: [] },
  }
  const previousIncludedTests = new Set(
    getDeployTestsFromManifest(previousVersion2Manifest)
  )

  const changedTests = new Set()

  for (const file of getDeployTestsFromManifest(currentManifest)) {
    const currentExcludedCases = getExcludedCases(
      currentManifest.suites?.[file]
    )
    const previousExcludedCases = getExcludedCases(
      previousVersion2Manifest.suites?.[file]
    )

    if (!previousIncludedTests.has(file)) {
      changedTests.add(file)
      continue
    }

    for (const testCase of previousExcludedCases) {
      if (!currentExcludedCases.has(testCase)) {
        changedTests.add(file)
        break
      }
    }
  }

  return [...changedTests]
}

/**
 * Detects changed tests files by comparing the current branch with `origin/canary`
 * Returns tests separated by test mode (dev/prod), as well as the corresponding commit hash
 * that the current branch is pointing to
 */
export default async function getChangedTests() {
  /** @type import('execa').Options */
  const EXECA_OPTS = { shell: true }

  const { branchName, remoteUrl, commitSha, isCanary } = await getGitInfo()

  if (isCanary) {
    console.log(`Skipping flake detection for canary`)
    return { devTests: [], prodTests: [], deployTests: [], commitSha }
  }

  const diffRevision = await getDiffRevision()

  const changesResult = await execa(
    `git diff ${diffRevision} --name-only`,
    EXECA_OPTS
  ).catch((err) => {
    console.error(err)
    return { stdout: '', stderr: '' }
  })
  console.log(
    {
      branchName,
      remoteUrl,
      isCanary,
      commitSha,
    },
    `\ngit diff:\n${changesResult.stderr}\n${changesResult.stdout}`
  )
  const changedFiles = changesResult.stdout.split('\n')

  // run each test 3 times in each test mode (if E2E) with no-retrying
  // and if any fail it's flakey
  const devTests = new Set()
  const prodTests = new Set()
  const deployTests = new Set()

  for (let file of changedFiles) {
    // normalize slashes
    file = normalizePath(file)
    const fileExists = await fs
      .access(path.join(process.cwd(), file), fs.constants.F_OK)
      .then(() => true)
      .catch(() => false)

    if (fileExists && file.match(TEST_FILE_REGEX)) {
      if (file.startsWith('test/e2e/')) {
        devTests.add(file)
        prodTests.add(file)
        deployTests.add(file)
      } else if (file.startsWith('test/integration/')) {
        devTests.add(file)
        prodTests.add(file)
      } else if (file.startsWith('test/prod')) {
        prodTests.add(file)
      } else if (file.startsWith('test/development')) {
        devTests.add(file)
      }
    }
  }

  const externalTestsFilterPaths = getExternalTestsFilterPaths()

  if (
    externalTestsFilterPaths.some(({ repoRelativePath }) =>
      changedFiles.includes(repoRelativePath)
    )
  ) {
    const currentManifest = mergeManifests(
      await Promise.all(
        externalTestsFilterPaths.map(async ({ absolutePath }) =>
          JSON.parse(await fs.readFile(absolutePath, 'utf8'))
        )
      )
    )
    const previousManifest = mergeManifests(
      (
        await Promise.all(
          externalTestsFilterPaths.map(async ({ repoRelativePath }) => {
            const previousManifestOutput = await execa(
              `git show ${diffRevision}:${repoRelativePath}`,
              EXECA_OPTS
            ).catch(() => null)

            return previousManifestOutput?.stdout
              ? JSON.parse(previousManifestOutput.stdout)
              : null
          })
        )
      ).filter(Boolean)
    )

    for (const file of getDeployManifestChangedTests(
      currentManifest,
      previousManifest
    )) {
      deployTests.add(file)
    }
  }

  const detectedTests = {
    devTests: [...devTests],
    prodTests: [...prodTests],
    deployTests: [...deployTests],
  }

  console.log('Detected tests:', JSON.stringify(detectedTests, null, 2))

  return { ...detectedTests, commitSha }
}
