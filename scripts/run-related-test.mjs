/**
 * This script finds all `.tests` files under the paths and reads lines from these files.
 * The script is useful to find all related test cases for a given code change.
 * Usage: `node scripts/run-related-test.mjs <path1> <path2> ...`
 */

import { promisify } from 'node:util'
import { exec as execOrg } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const exec = promisify(execOrg)

/**
 * Get all changed files from git under the packages directory
 * @returns {Promise<string[]>} - List of changed files
 */
async function getChangedFilesFromPackages(baseBranch = 'origin/canary') {
  const { stdout } = await exec(`git diff --name-only ${baseBranch}`)
  return stdout
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('packages/'))
}

export async function getRelatedTests(args = []) {
  const paths = args.length ? args : await getChangedFilesFromPackages()
  const relatedTestFile = '.tests'
  const tests = []
  for (const path of paths) {
    const testFile = join(dirname(path), relatedTestFile)
    const content = await readFile(testFile, 'utf-8').catch(() => false)
    if (content) {
      const lines = content.split('\n').filter(Boolean)
      tests.push(...lines)
    }
  }

  return Array.from(new Set(tests))
}

// console.log(await getRelatedTests(process.argv.slice(2)))
