import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

function ownedRelativePath(root: string, file: string): string {
  const path = relative(root, file)
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path))
    throw new Error('Parallel watch report file is outside its owned root.')
  return path.split(sep).join('/')
}

/** File completion order is unspecified across parallel workers. Only complete,
 * distinct, canonically owned rows from unchanged generated cases may be ordered.
 * Assertions within a row and every other result value retain their raw identity.
 */
export async function orderParallelWatchFiles<
  Report extends {
    testResults: { name?: string }[]
  },
>(report: Report, root: string, sources: ReadonlyMap<string, string>) {
  const canonicalRoot = await realpath(root)
  if (!sources.size || !Array.isArray(report.testResults))
    throw new Error(
      'Parallel watch report is missing its generated file membership.'
    )
  const expected = new Map<string, { file: string; hash: string }>()
  for (const [name, hash] of sources) {
    if (
      !name ||
      isAbsolute(name) ||
      name.includes('\\') ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error('Invalid generated parallel watch source identity.')
    const file = await realpath(join(root, name))
    if (
      ownedRelativePath(canonicalRoot, file) !== name ||
      expected.has(file) ||
      !(await stat(file)).isFile()
    )
      throw new Error('Generated parallel watch source ownership changed.')
    expected.set(file, { file, hash })
  }
  if (report.testResults.length !== expected.size)
    throw new Error(
      'Parallel watch report does not contain the exact generated file membership.'
    )
  const seen = new Set<string>()
  const rows = []
  for (const file of report.testResults) {
    if (typeof file?.name !== 'string' || !isAbsolute(file.name))
      throw new Error(
        'Parallel watch report file is missing its absolute identity.'
      )
    const canonicalFile = await realpath(file.name)
    const name = ownedRelativePath(canonicalRoot, canonicalFile)
    if (
      !expected.has(canonicalFile) ||
      seen.has(canonicalFile) ||
      !(await stat(canonicalFile)).isFile()
    )
      throw new Error(
        'Parallel watch report contains an unexpected or duplicate file identity.'
      )
    seen.add(canonicalFile)
    rows.push({ name, file })
  }
  for (const { file, hash } of expected.values()) {
    if (
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex') !== hash
    )
      throw new Error(
        'Generated parallel watch case source changed before observation.'
      )
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { ...report, testResults: rows.map((row) => row.file) }
}
