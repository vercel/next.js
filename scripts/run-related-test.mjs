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
    const result = await exec(command).catch((e) => e)
    foundPaths.push(...result.stdout.split('\n'))
  }
  return foundPaths.filter(Boolean)
}

/**
 * Read lines after the marker from a file
 * @param {string} filePath - File path to read
 * @param {string} marker - Marker to search for
 */
async function readTestLines(filePath, marker) {
  const grepCommand = `awk '/${marker.replaceAll(
    '/',
    '\\/'
  )}/{flag=1;next}/^$/{flag=0}flag' ${filePath} | sort | uniq`
  const result = await exec(grepCommand, {})

  return result.stdout
    .replace(/^\/\/ /gm, '')
    .split('\n')
    .filter(Boolean)
}

const paths = process.argv.slice(2)
const marker = '// TEST:'
const files = await findFiles(paths, marker)
const lines = []
for (const file of files) lines.push(...(await readTestLines(file, marker)))

console.log(Array.from(new Set(lines)).join('\n'))
