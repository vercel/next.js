/**
 * This script finds all files under the paths that contain a marker and reads lines after the marker from the files.
 * The marker is defined as a comment line that starts with `// TEST:`.
 * The script is useful to find all related test cases for a given code change.
 * Usage: `node scripts/run-related-test.mjs <path1> <path2> ...`
 */

import { promisify } from 'node:util'
import { exec as execOrg } from 'node:child_process'

const exec = promisify(execOrg)

/**
 * Find all files under the paths that contain a marker
 * @param {string[]} paths - Paths to search in
 * @param {string} marker - Marker to search for
 */
async function findFiles(paths, marker) {
  const foundPaths = []
  for (const path of paths) {
    const command = `find "${path}" -type f -exec grep -l "${marker}" {} +`
    const { stdout } = await exec(command).catch((e) => e)
    foundPaths.push(...stdout.trim().split('\n'))
  }
  return foundPaths.filter(Boolean)
}

/**
 * Read lines after the marker from a file
 * @param {string} filePath - File path to read
 * @param {string} marker - Marker to search for
 */
async function readTestLines(filePath, marker) {
  const escapedMarker = marker.replaceAll('/', '\\/')
  let command = `awk '/${escapedMarker}/{flag=1;next}/^$/{flag=0}flag' ${filePath}`
  command += ' | sort | uniq' // Sort and remove duplicates
  const { stdout } = await exec(command)

  return stdout
    .trim()
    .replace(/^\/\/ /gm, '') // Remove the '// ' comment prefix
    .split('\n')
}

/**
 * Get all changed files from git under the packages directory
 * @returns {Promise<string[]>} - List of changed files
 */
async function getChangedFilesFromPackages(baseBranch = 'canary') {
  const { stdout } = await exec(`git diff --name-only ${baseBranch}`)
  return stdout
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('packages/'))
}

const args = process.argv.slice(2)
const paths = args.length ? args : await getChangedFilesFromPackages()
const marker = '// TEST:'
const files = await findFiles(paths, marker)
const lines = []
for (const file of files) lines.push(...(await readTestLines(file, marker)))

console.log(Array.from(new Set(lines)).join('\n'))
