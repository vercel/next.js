import { assertConfigurationImportFiles } from '../compiler/config-import-facts'
import type { ConfigurationImportAuthorization } from '../compiler/config-import-proof'
import { CONFIG_FILES } from '../../../shared/lib/constants'
import { randomUUID } from 'crypto'
import { lstat, readFile, readdir, realpath } from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { isDeepStrictEqual } from 'util'
import picomatch from 'next/dist/compiled/picomatch'
import type { TestProfile } from '../contracts'
import type { DiscoveredTestProject } from '../discovery'
import { usesInSourceTestMarker } from '../in-source'
import { coverageHash, within } from './artifact'
import { sourceAnalysisEntryId } from './source-analysis'
import { standardCoverageSourceSelector } from './options'
import type { CompilerSourceCoverage, StandardCoverageOptions } from './types'

export interface CoverageSourceRequest {
  profile: TestProfile
  source: { file: string; sha256: string }
  revision: string
  configurationImports?: ConfigurationImportAuthorization
}
export interface CoverageSourcePlan {
  version: 1
  requests: CoverageSourceRequest[]
  inputs: { file: string; sha256: string }[]
  /** Exact supported candidate names, including absence and config precedence. */
  configuration?: { directory: string; names: string[]; files: string[] }[]
}

type Project = Pick<
  DiscoveredTestProject,
  | 'profile'
  | 'entries'
  | 'include'
  | 'exclude'
  | 'includeSource'
  | 'setupFiles'
  | 'snapshotSerializers'
  | 'compilerAliases'
>
const sourceKey = (profile: TestProfile, file: string) =>
  JSON.stringify([profile.id, file])

async function input(file: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const before = await lstat(file, { bigint: true })
  if (
    !before.isFile() ||
    !isAbsolute(file) ||
    resolve(file) !== file ||
    (await realpath(file)) !== file
  )
    throw new Error(
      'Compiler coverage analysis input must be a canonical regular file'
    )
  const bytes = await readFile(file)
  const after = await lstat(file, { bigint: true })
  if (
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs
  )
    throw new Error('Compiler coverage analysis input changed while selected')
  signal.throwIfAborted()
  return { file, sha256: coverageHash(bytes) }
}

async function configurationInventory(
  root: string,
  profiles: readonly TestProfile[],
  signal: AbortSignal
) {
  const rootNames = [
    ...new Set([
      ...CONFIG_FILES,
      'tsconfig.json',
      'jsconfig.json',
      'package.json',
      '.env',
      '.env.local',
      ...profiles.flatMap((profile) => [
        `.env.${profile.mode}`,
        `.env.${profile.mode}.local`,
      ]),
    ]),
  ].sort()
  const result: NonNullable<CoverageSourcePlan['configuration']> = []
  let directory = root
  for (;;) {
    signal.throwIfAborted()
    if ((await realpath(directory)) !== directory)
      throw new Error(
        'Compiler configuration inventory directory is not canonical'
      )
    const names = directory === root ? rootNames : [...CONFIG_FILES].sort()
    const files = (await readdir(directory))
      .filter((name) => names.includes(name))
      .sort()
    result.push({ directory, names, files })
    // This is the same ancestor search boundary as Next loadConfig/findUp.
    if (
      files.some((file) => CONFIG_FILES.includes(file)) ||
      dirname(directory) === directory
    )
      break
    directory = dirname(directory)
  }
  return result
}

/** Parent filesystem/config selection; runtime reports and hit values are never inputs. */
export async function createCoverageSourcePlan(options: {
  projectDir: string
  projects: readonly Project[]
  config: StandardCoverageOptions
  inputs?: readonly string[]
  includeUnimported?: boolean
  signal: AbortSignal
}): Promise<CoverageSourcePlan> {
  const { signal } = options
  signal.throwIfAborted()
  const empty: CoverageSourcePlan = { version: 1, requests: [], inputs: [] }
  if (!options.config.include || options.includeUnimported === false)
    return empty
  const root = await realpath(options.projectDir),
    output = resolve(root, options.config.reportsDirectory)
  const selected = standardCoverageSourceSelector(root, options.config)
  const excluded = new Set(
    options.projects.flatMap((project) => [
      ...project.entries.map((entry) => entry.file),
      ...project.setupFiles,
      ...(project.snapshotSerializers ?? []),
    ])
  )
  const tests = options.projects.map((project) => ({
    include: picomatch(project.include),
    exclude: picomatch(project.exclude),
    source: project.includeSource?.length
      ? picomatch(project.includeSource)
      : undefined,
  }))
  const sources: { file: string; sha256: string }[] = []
  const inputs = new Set(options.inputs)
  for (const project of options.projects) {
    for (const file of [
      ...project.setupFiles,
      ...(project.snapshotSerializers ?? []),
      ...(project.compilerAliases?.inputs ?? []),
    ])
      inputs.add(file)
  }
  async function visit(dir: string) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      signal.throwIfAborted()
      const file = join(dir, item.name)
      if (
        item.name.startsWith('.') ||
        item.name === 'node_modules' ||
        file === output
      )
        continue
      if (item.isDirectory()) {
        await visit(file)
        continue
      }
      if (
        item.isSymbolicLink() &&
        selected(file) &&
        /\.[cm]?[jt]sx?$/.test(file) &&
        !/\.[cm]?js$/.test(file)
      )
        throw new Error(
          `Compiler coverage analysis source must be a canonical regular file: ${file}`
        )
      if (!item.isFile()) continue
      if (
        !selected(file) ||
        excluded.has(file) ||
        !/\.[cm]?[jt]sx?$/.test(file) ||
        /\.[cm]?js$/.test(file) ||
        /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) ||
        /\.d\.[cm]?ts$/.test(file)
      )
        continue
      const path = relative(root, file).split(sep).join('/')
      if (tests.some((test) => test.include(path) && !test.exclude(path)))
        continue
      if (
        tests.some((test) => test.source?.(path)) &&
        usesInSourceTestMarker(await readFile(file, 'utf8'), file)
      )
        continue
      const value = await input(file, signal)
      if (!within(root, value.file))
        throw new Error('Compiler coverage analysis source escapes its project')
      sources.push(value)
    }
  }
  await visit(root)
  if (!sources.length) return empty
  const profiles = new Set<string>()
  for (const project of options.projects) {
    if (profiles.has(project.profile.id))
      throw new Error('Duplicate compiler coverage analysis profile')
    profiles.add(project.profile.id)
  }
  const configuration = await configurationInventory(
    root,
    options.projects.map((project) => project.profile),
    signal
  )
  for (const directory of configuration)
    for (const file of directory.files)
      inputs.add(join(directory.directory, file))
  const selectedDirectory = configuration[configuration.length - 1]
  const selectedName = CONFIG_FILES.find((name) =>
    selectedDirectory.files.includes(name)
  )
  const configFile = selectedName
    ? join(selectedDirectory.directory, selectedName)
    : null
  const importRequests = new Map(
    options.projects.map((project) => [
      project.profile.id,
      { id: randomUUID(), configFile },
    ])
  )
  return {
    version: 1,
    configuration,
    requests: options.projects.flatMap((project) =>
      sources
        .sort((a, b) => a.file.localeCompare(b.file))
        .map((source) => ({
          profile: { ...project.profile },
          source: { ...source },
          revision: randomUUID(),
          configurationImports: importRequests.get(project.profile.id)!,
        }))
    ),
    inputs: await Promise.all(
      [...inputs].sort().map((file) => input(file, signal))
    ),
  }
}

export async function assertCoverageSourcePlan(
  plan: CoverageSourcePlan,
  signal: AbortSignal
) {
  signal.throwIfAborted()
  if (plan.requests.length && !plan.configuration?.length)
    throw new Error(
      'Compiler source analysis requires a parent configuration inventory'
    )
  for (const previous of plan.configuration ?? []) {
    if ((await realpath(previous.directory)) !== previous.directory)
      throw new Error(
        'Compiler configuration inventory directory is not canonical'
      )
    const current = (await readdir(previous.directory))
      .filter((name) => previous.names.includes(name))
      .sort()
    if (JSON.stringify(current) !== JSON.stringify(previous.files))
      throw new Error(
        'Compiler coverage configuration inventory changed after selection'
      )
  }
  for (const previous of [
    ...plan.inputs,
    ...plan.requests.map((request) => request.source),
  ]) {
    const actual = await input(previous.file, signal)
    if (actual.sha256 !== previous.sha256)
      throw new Error(
        'Compiler coverage analysis inputs changed after selection'
      )
  }
  signal.throwIfAborted()
}

/** Only parent-derived facts enter; every requested source/profile must be complete. */
export async function assertCompilerSourceCoverage(
  facts: readonly CompilerSourceCoverage[],
  plan: CoverageSourcePlan,
  signal: AbortSignal
) {
  await assertCoverageSourcePlan(plan, signal)
  const seen = new Set<string>(),
    files = new Map<string, CompilerSourceCoverage>()
  if (facts.length !== plan.requests.length)
    throw new Error('Incomplete compiler coverage source analysis')
  for (const fact of facts) {
    const key = sourceKey(fact.profile, fact.source.file),
      request = plan.requests.find(
        (candidate) =>
          sourceKey(candidate.profile, candidate.source.file) === key
      )
    if (
      !request ||
      seen.has(key) ||
      fact.version !== 1 ||
      fact.kind !== 'next-compiler-declarations' ||
      !isDeepStrictEqual(fact.source, request.source) ||
      !isDeepStrictEqual(fact.profile, request.profile) ||
      fact.compiler.entryId !==
        sourceAnalysisEntryId(request.profile, request.source.file) ||
      fact.compiler.revision !== request.revision ||
      fact.data.path !== request.source.file ||
      [
        ...Object.values(fact.data.s),
        ...Object.values(fact.data.f),
        ...Object.values(fact.data.b).flat(),
      ].some((value) => value !== 0)
    )
      throw new Error(
        'Unrequested or incompatible compiler coverage declaration fact'
      )
    if (request.configurationImports) {
      if (
        !isDeepStrictEqual(
          fact.compiler.configurationImports?.request,
          request.configurationImports
        )
      )
        throw new Error(
          'Compiler coverage declaration lacks its parent Next config import request'
        )
      await assertConfigurationImportFiles(
        fact.compiler.configurationImports?.graph,
        request.configurationImports.configFile,
        signal
      )
    } else if (fact.compiler.configurationImports)
      throw new Error('Unrequested compiler coverage Next config import facts')
    seen.add(key)
    const previous = files.get(fact.source.file)
    if (
      previous &&
      (!isDeepStrictEqual(previous.source, fact.source) ||
        !isDeepStrictEqual(previous.data, fact.data))
    )
      throw new Error(
        `Selected compiler profiles disagree on original coverage descriptors: ${fact.source.file}`
      )
    files.set(fact.source.file, fact)
  }
  signal.throwIfAborted()
  return [...files.values()].map((fact) => structuredClone(fact))
}

/** Shared parent filesystem observations; neither helper evaluates config. */
export { input as readCoverageInput, configurationInventory }
