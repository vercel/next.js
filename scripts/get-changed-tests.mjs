// @ts-check
import fs from 'fs/promises'
import execa from 'execa'
import { createRequire } from 'module'
import path from 'path'
import { getDiffRevision, getGitInfo } from './git-info.mjs'

const require = createRequire(import.meta.url)
const { existsSync } = require('fs')
const glob = require('glob')
const minimatch = require('minimatch')

const DEPLOY_TESTS_MANIFEST_PATH = 'test/deploy-tests-manifest.json'
const TEST_FILE_REGEX = /^test\/.*?\.test\.(js|ts|tsx)$/
const DEPLOY_TEST_FILE_REGEX = /^test\/e2e\/.*?\.test\.(js|ts|tsx)$/

function normalizePath(file) {
  return file.replace(/\\/g, '/')
}

function getExcludedCases(suite = {}) {
  return new Set([...(suite.failed ?? []), ...(suite.flakey ?? [])])
}

function isVersion2Manifest(manifest) {
  return manifest?.version === 2
}

function isIncludedByDeployManifest(file, manifest) {
  if (!isVersion2Manifest(manifest)) {
    return false
  }

  const { suites = {}, rules = {} } = manifest
  const excludeRules = rules.exclude ?? []
  const includeRules = rules.include ?? []

  if (file in suites) {
    return !excludeRules.includes(file)
  }

  if (
    includeRules.length > 0 &&
    includeRules.every((pattern) => !minimatch(file, pattern))
  ) {
    return false
  }

  if (excludeRules.some((pattern) => minimatch(file, pattern))) {
    return false
  }

  return true
}

function getDeployTestsFromManifest(manifest) {
  if (!isVersion2Manifest(manifest)) {
    return []
  }

  const files = new Set()

  for (const file of Object.keys(manifest.suites ?? {})) {
    const normalizedFile = normalizePath(file)
    if (
      DEPLOY_TEST_FILE_REGEX.test(normalizedFile) &&
      existsSync(path.join(process.cwd(), normalizedFile))
    ) {
      files.add(normalizedFile)
    }
  }

  for (const pattern of manifest.rules?.include ?? []) {
    for (const file of glob.sync(pattern, {
      cwd: process.cwd(),
      ignore: '**/node_modules/**',
      nodir: true,
    })) {
      const normalizedFile = normalizePath(file)
      if (DEPLOY_TEST_FILE_REGEX.test(normalizedFile)) {
        files.add(normalizedFile)
      }
    }
  }

  return [...files].filter((file) => isIncludedByDeployManifest(file, manifest))
}

export function getDeployManifestChangedTests(
  currentManifest,
  previousManifest
) {
  if (
    !isVersion2Manifest(currentManifest) ||
    !isVersion2Manifest(previousManifest)
  ) {
    return []
  }

  const changedTests = new Set()

  for (const file of getDeployTestsFromManifest(currentManifest)) {
    const currentExcludedCases = getExcludedCases(
      currentManifest.suites?.[file]
    )
    const previousExcludedCases = getExcludedCases(
      previousManifest.suites?.[file]
    )

    if (!isIncludedByDeployManifest(file, previousManifest)) {
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
    return { devTests: [], prodTests: [], deployTests: [] }
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

  if (changedFiles.includes(DEPLOY_TESTS_MANIFEST_PATH)) {
    const currentManifest = JSON.parse(
      await fs.readFile(
        path.join(process.cwd(), DEPLOY_TESTS_MANIFEST_PATH),
        'utf8'
      )
    )
    const previousManifestOutput = await execa(
      `git show ${diffRevision}:${DEPLOY_TESTS_MANIFEST_PATH}`,
      EXECA_OPTS
    ).catch(() => null)

    if (previousManifestOutput?.stdout) {
      const previousManifest = JSON.parse(previousManifestOutput.stdout)

      for (const file of getDeployManifestChangedTests(
        currentManifest,
        previousManifest
      )) {
        deployTests.add(file)
      }
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
