/**
 * This script reads the 'test/realted-tests-manifest.json' file, which contains a list of test globs that maps source code files to test files.
 * The script is used to find all related test cases for a given code change.
 * Usage: `node scripts/run-related-test.mjs <path1> <path2> ...`
 */

import { promisify } from 'node:util'
import { exec as execOrg } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const exec = promisify(execOrg)

/**
 * Get all changed files from git under the packages directory
 * @returns {Promise<string[]>} - List of changed files
 */
async function getChangedFilesFromPackages(baseBranch = 'canary') {
  await exec('git config --global --add safe.directory /work')
  await exec(`git remote set-branches --add origin ${baseBranch}`)
  await exec(`git fetch origin ${baseBranch} --depth=20`)
  const { stdout } = await exec(
    `git diff 'origin/${baseBranch}...' --name-only`
  )
  return stdout
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('packages/'))
}

export async function getRelatedTests(args = []) {
  const relatedTestsManifest = join(
    process.cwd(),
    'test',
    'related-tests-manifest.json'
  )
  /** @type {Record<string, string[]>} */
  const manifest = JSON.parse(
    await readFile(relatedTestsManifest, 'utf-8').catch(() => '{}')
  )
  const tests = []
  const paths = args.length ? args : await getChangedFilesFromPackages()
  for (const path of paths) {
    const relatedTestsKey = Object.keys(manifest).find((key) =>
      path.startsWith(key)
    )
    if (relatedTestsKey) {
      const lines = manifest[relatedTestsKey]
      tests.push(...lines)
    }
  }

  return Array.from(new Set(tests))
}

// console.log(await getRelatedTests(process.argv.slice(2)))
