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

const DEFAULT_DEPLOY_TESTS_MANIFEST_PATH = 'test/deploy-tests-manifest.json'
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

function normalizeExternalTestsFilters(externalTestsFilters) {
  if (!externalTestsFilters) {
    return []
  }

  if (Array.isArray(externalTestsFilters)) {
    return externalTestsFilters.flatMap((value) =>
      normalizeExternalTestsFilters(value)
    )
  }

  if (typeof externalTestsFilters === 'string') {
    const trimmedValue = externalTestsFilters.trim()

    if (!trimmedValue) {
      return []
    }

    if (trimmedValue.startsWith('[')) {
      try {
        const parsedValue = JSON.parse(trimmedValue)
        if (Array.isArray(parsedValue)) {
          return parsedValue.flatMap((value) =>
            normalizeExternalTestsFilters(value)
          )
        }
      } catch {}
    }

    return trimmedValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  return [String(externalTestsFilters)]
}

function getExternalTestsFilterPaths() {
  const externalTestsFilters =
    process.env.NEXT_EXTERNAL_TESTS_FILTERS ??
    DEFAULT_DEPLOY_TESTS_MANIFEST_PATH

  const manifestPaths = new Map()

  for (const manifestPath of normalizeExternalTestsFilters(
    externalTestsFilters
  )) {
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

export function mergeVersion2Manifests(manifests) {
  return manifests.reduce((mergedManifest, manifest) => {
    if (!isVersion2Manifest(manifest)) {
      return mergedManifest
    }

    if (!mergedManifest) {
      return structuredClone(manifest)
    }

    for (const suite in manifest.suites) {
      if (mergedManifest.suites[suite]) {
        const mergedSuite = mergedManifest.suites[suite]
        const currentSuite = manifest.suites[suite]
        mergedSuite.failed = [
          ...(mergedSuite.failed || []),
          ...(currentSuite.failed || []),
        ]
        mergedSuite.flakey = [
          ...(mergedSuite.flakey || []),
          ...(currentSuite.flakey || []),
        ]
      } else {
        mergedManifest.suites[suite] = structuredClone(manifest.suites[suite])
      }
    }

    mergedManifest.rules.include.push(...(manifest.rules.include || []))
    mergedManifest.rules.exclude.push(...(manifest.rules.exclude || []))

    return mergedManifest
  }, null)
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
  if (!isVersion2Manifest(currentManifest)) {
    return []
  }

  const previousVersion2Manifest = isVersion2Manifest(previousManifest)
    ? previousManifest
    : { version: 2, suites: {}, rules: { include: [], exclude: [] } }

  const changedTests = new Set()

  for (const file of getDeployTestsFromManifest(currentManifest)) {
    const currentExcludedCases = getExcludedCases(
      currentManifest.suites?.[file]
    )
    const previousExcludedCases = getExcludedCases(
      previousVersion2Manifest.suites?.[file]
    )

    if (!isIncludedByDeployManifest(file, previousVersion2Manifest)) {
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
    const currentManifest = mergeVersion2Manifests(
      await Promise.all(
        externalTestsFilterPaths.map(async ({ absolutePath }) =>
          JSON.parse(await fs.readFile(absolutePath, 'utf8'))
        )
      )
    )
    const previousManifest = mergeVersion2Manifests(
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
