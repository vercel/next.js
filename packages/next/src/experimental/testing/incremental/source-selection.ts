import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { lstat, readFile, realpath } from 'fs/promises'
import { basename, isAbsolute, resolve } from 'path'
import type { CompiledSourceDependencies, TestEntry } from '../contracts'
import type { DiscoveredTestProject } from '../discovery'

export interface SourceSelectionPlan {
  version: 1
  entries: {
    id: string
    file: string
    sha256: string
    dependencies?: CompiledSourceDependencies
    compilationFailed?: true
  }[]
  configuration: {
    complete: boolean
    files: { file: string; sha256: string }[]
  }
}

const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')
const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

/** Validate native bytes, preserving the compiler's actual source identities. */
export async function readSourceDependencyAsset(
  rootDir: string,
  entryPath: string,
  projectDir: string,
  entry: TestEntry,
  sourceHash: string
): Promise<CompiledSourceDependencies> {
  const metadataPath = resolve(
    rootDir,
    entryPath.replace(/\.js$/, '.dependencies.json')
  )
  const value: CompiledSourceDependencies = JSON.parse(
    await readFile(metadataPath, 'utf8')
  )
  if (
    value.version !== 1 ||
    value.kind !== 'native-module-sources' ||
    typeof value.complete !== 'boolean' ||
    !Array.isArray(value.files) ||
    !value.entry ||
    typeof value.entry.file !== 'string' ||
    !isDigest(value.entry.sha256)
  )
    throw new Error('Invalid native source dependency metadata')
  const seen = new Set<string>()
  const files = await Promise.all(
    value.files.map(async (source) => {
      if (
        !source ||
        typeof source.file !== 'string' ||
        isAbsolute(source.file) ||
        !isDigest(source.sha256)
      )
        throw new Error('Invalid native source dependency identity')
      const lexical = resolve(projectDir, source.file)
      const file = await realpath(lexical)
      if (lexical !== file) value.complete = false
      if (
        seen.has(file) ||
        !(await lstat(file)).isFile() ||
        digest(await readFile(file)) !== source.sha256
      )
        throw new Error('Native source dependency changed during compilation')
      seen.add(file)
      return { file, sha256: source.sha256 }
    })
  )
  const actualEntry = await realpath(resolve(projectDir, value.entry.file))
  if (
    actualEntry !== entry.file ||
    value.entry.sha256 !== sourceHash ||
    !files.some(
      (source) => source.file === actualEntry && source.sha256 === sourceHash
    )
  )
    throw new Error('Native source dependency entry does not match compilation')
  return { ...value, entry: { file: actualEntry, sha256: sourceHash }, files }
}

/** Hash races are stale evidence and safely widen only after planner closure. */
async function sourcesCurrent(files: { file: string; sha256: string }[]) {
  const seen = new Set<string>()
  for (const source of files) {
    if (
      !source ||
      !isAbsolute(source.file) ||
      !isDigest(source.sha256) ||
      seen.has(source.file)
    )
      throw new Error('Invalid source selection identity')
    seen.add(source.file)
    try {
      if (
        (await realpath(source.file)) !== source.file ||
        !(await lstat(source.file)).isFile() ||
        digest(await readFile(source.file)) !== source.sha256
      )
        return false
    } catch (error) {
      if (
        ['ENOENT', 'ENOTDIR'].includes(
          (error as NodeJS.ErrnoException).code ?? ''
        )
      )
        return false
      throw error
    }
  }
  return true
}

/** Accept a plan only after the supervised compiler, pipes and caches close. */
export async function selectSourceRelatedProjects(
  projects: DiscoveredTestProject[],
  related: readonly string[],
  plan: SourceSelectionPlan
): Promise<DiscoveredTestProject[]> {
  const entries = projects.flatMap((project) => project.entries)
  if (
    !plan ||
    plan.version !== 1 ||
    !Array.isArray(plan.entries) ||
    plan.entries.length !== entries.length ||
    !plan.configuration ||
    typeof plan.configuration.complete !== 'boolean' ||
    !Array.isArray(plan.configuration.files)
  )
    throw new Error('Invalid source selection plan')
  for (let index = 0; index < entries.length; index++) {
    const fact = plan.entries[index],
      entry = entries[index]
    if (
      !fact ||
      fact.id !== entry.id ||
      fact.file !== entry.file ||
      !isDigest(fact.sha256) ||
      (fact.compilationFailed !== undefined && fact.compilationFailed !== true)
    )
      throw new Error('Source selection plan does not match requested entries')
    if (
      fact.dependencies &&
      (fact.dependencies.version !== 1 ||
        fact.dependencies.kind !== 'native-module-sources' ||
        typeof fact.dependencies.complete !== 'boolean' ||
        !Array.isArray(fact.dependencies.files) ||
        fact.dependencies.entry?.file !== entry.file ||
        fact.dependencies.entry.sha256 !== fact.sha256 ||
        !fact.dependencies.files.some(
          (source) => source.file === fact.file && source.sha256 === fact.sha256
        ))
    )
      throw new Error('Invalid compiler source graph identity')
  }
  if (
    !plan.configuration.complete ||
    !(await sourcesCurrent(plan.configuration.files))
  )
    return projects
  const input = new Set(
    await Promise.all(
      related.map(async (file) => {
        const absolute = resolve(file)
        try {
          return await realpath(absolute)
        } catch (error) {
          if (
            ['ENOENT', 'ENOTDIR'].includes(
              (error as NodeJS.ErrnoException).code ?? ''
            )
          )
            return absolute
          throw error
        }
      })
    )
  )
  const global =
    /^(?:(?:next|vitest|vite)(?:\.test)?\.config\.[cm]?[jt]s|next\.test\.config\.json|(?:ts|js)config(?:\..+)?\.json|\.env(?:\..+)?)$/
  if (
    [...input].some((file) => global.test(basename(file))) ||
    plan.configuration.files.some((source) => input.has(source.file))
  )
    return projects
  // Every source used to prove an exclusion must still match the native snapshot.
  for (const fact of plan.entries) {
    if (!(await sourcesCurrent([{ file: fact.file, sha256: fact.sha256 }])))
      return projects
    if (fact.dependencies && !(await sourcesCurrent(fact.dependencies.files)))
      return projects
  }
  const selected = new Set(
    plan.entries
      .filter(
        (fact) =>
          fact.compilationFailed ||
          !fact.dependencies?.complete ||
          input.has(fact.file) ||
          fact.dependencies.files.some((source) => input.has(source.file)) ||
          input.has(
            resolve(
              fact.file,
              '..',
              '__snapshots__',
              basename(fact.file) + '.snap'
            )
          )
      )
      .map((fact) => fact.id)
  )
  return projects.map((project) => ({
    ...project,
    entries: project.entries.filter((entry) => selected.has(entry.id)),
  }))
}

const execFileAsync = promisify(execFile)
/** Pinned Vitest Git union: merge-base committed diff, staged, modified/untracked. */
export async function findChangedTestSources(
  projectDir: string,
  changed: true | string
): Promise<string[]> {
  const options = {
    cwd: projectDir,
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  }
  let root: string
  try {
    root = (
      await execFileAsync('git', ['rev-parse', '--show-toplevel'], options)
    ).stdout.trim()
  } catch {
    throw new Error('--changed requires a Git repository')
  }
  const commands = [
    ['diff', '--cached', '--name-only', '-z'],
    ['ls-files', '--other', '--modified', '--exclude-standard', '-z'],
    ...(typeof changed === 'string'
      ? [['diff', '--name-only', '-z', `${changed}...HEAD`]]
      : []),
  ]
  const results = await Promise.all(
    commands.map((args) =>
      execFileAsync('git', args, { ...options, cwd: root })
    )
  )
  return [
    ...new Set(
      results.flatMap(({ stdout }) =>
        stdout
          .split('\0')
          .filter(Boolean)
          .map((file) => resolve(root, file))
      )
    ),
  ]
}
