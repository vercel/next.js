import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  CompiledNodeTestArtifact,
  CompiledTestArtifact,
  CompiledTestCohortIdentity,
  TestEntry,
} from '../contracts'
import { assertArtifactProfile } from './artifact-profile'
import type { WorkerLeaseInput } from './protocol'

export type CohortArtifact = CompiledNodeTestArtifact & {
  cohort: CompiledTestCohortIdentity
}

export function cohortArtifactPath(root: string, file: string): string {
  const target = resolve(root, file)
  const path = relative(root, target)
  if (
    !isAbsolute(root) ||
    !file ||
    isAbsolute(file) ||
    !path ||
    path === '..' ||
    path.startsWith(`..${sep}`) ||
    file.includes('\\')
  )
    throw new Error(
      'Compiled cohort paths must remain within their revision root.'
    )
  return target
}

/** Validate exact per-file dispatch identity before evaluating the shared entry. */
export function assertCohortArtifact(
  artifact: CompiledTestArtifact,
  entry: TestEntry,
  projectDir: string,
  lease: WorkerLeaseInput
): asserts artifact is CohortArtifact {
  assertArtifactProfile(artifact, entry)
  if (
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.mode !== 'development' ||
    artifact.profile.route !== undefined ||
    artifact.moduleMocking ||
    (artifact.kind === 'node' &&
      (artifact.moduleCache || artifact.dynamicModuleMocking)) ||
    artifact.coverage ||
    artifact.setupFiles?.length ||
    artifact.snapshotSerializers?.length ||
    artifact.rootDir !== lease.rootDir ||
    artifact.revision !== lease.revision ||
    JSON.stringify(artifact.profile) !== JSON.stringify(lease.profile)
  )
    throw new Error('Unsupported or mismatched shared compiler cohort profile.')
  const cohort = artifact.cohort
  if (
    !cohort ||
    cohort.version !== 1 ||
    !Number.isInteger(cohort.index) ||
    !Array.isArray(cohort.entries) ||
    !cohort.entries.length ||
    cohort.index < 0 ||
    cohort.index >= cohort.entries.length ||
    !cohort.metadataPath ||
    !Array.isArray(artifact.files) ||
    new Set(artifact.files).size !== artifact.files.length ||
    !artifact.files.includes(artifact.entryPath) ||
    !artifact.files.includes(cohort.metadataPath)
  )
    throw new Error(
      'Missing or invalid compiler-owned cohort dispatch identity.'
    )
  if (
    !Array.isArray(cohort.outputs) ||
    cohort.outputs.length !== artifact.files.length
  )
    throw new Error('Missing compiler-owned emitted cohort byte identities.')
  for (let index = 0; index < artifact.files.length; index++) {
    const output = cohort.outputs[index]
    if (
      !output ||
      output.path !== artifact.files[index] ||
      typeof output.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(output.sha256)
    )
      throw new Error('Invalid compiler-owned emitted cohort byte identity.')
  }
  const ids = new Set<string>(),
    files = new Set<string>()
  for (const input of cohort.entries) {
    if (
      !input ||
      typeof input.entryId !== 'string' ||
      !input.entryId ||
      typeof input.file !== 'string' ||
      !input.file ||
      isAbsolute(input.file) ||
      input.file.includes('\\') ||
      input.file
        .split('/')
        .some((part: string) => !part || part === '.' || part === '..') ||
      typeof input.sourceHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.sourceHash) ||
      ids.has(input.entryId) ||
      files.has(input.file)
    )
      throw new Error('Invalid compiler-owned cohort source identity.')
    ids.add(input.entryId)
    files.add(input.file)
  }
  const own = cohort.entries[cohort.index]
  const projectFile = relative(projectDir, entry.file).split(sep).join('/')
  if (
    !isAbsolute(projectDir) ||
    !isAbsolute(entry.file) ||
    entry.typecheck ||
    own.entryId !== entry.id ||
    own.entryId !== artifact.entryId ||
    own.sourceHash !== artifact.sourceHash ||
    own.file !== projectFile
  )
    throw new Error(
      'Shared cohort index does not match the requested source file.'
    )
  for (const file of artifact.files) cohortArtifactPath(artifact.rootDir, file)
}

/** Every member must name the same actual emitted closure and ordered module roots. */
export function cohortClosureIdentity(artifact: CohortArtifact): string {
  return JSON.stringify({
    rootDir: artifact.rootDir,
    revision: artifact.revision,
    entryPath: artifact.entryPath,
    files: artifact.files,
    profile: artifact.profile,
    metadataPath: artifact.cohort.metadataPath,
    entries: artifact.cohort.entries,
    outputs: artifact.cohort.outputs,
  })
}

export async function validateCohortFiles(
  artifact: CohortArtifact
): Promise<void> {
  const root = resolve(artifact.rootDir)
  const canonicalRoot = await realpath(root)
  if (!(await lstat(root)).isDirectory())
    throw new Error('Shared cohort root must be a real retained directory.')
  for (let index = 0; index < artifact.files.length; index++) {
    const file = artifact.files[index]
    const target = cohortArtifactPath(root, file)
    if (
      !(await lstat(target)).isFile() ||
      (await realpath(target)) !== resolve(canonicalRoot, file)
    )
      throw new Error('Shared cohorts require regular immutable emitted files.')
    const identity = artifact.cohort.outputs[index]
    const sha256 = createHash('sha256')
      .update(await readFile(target))
      .digest('hex')
    if (!identity || identity.path !== file || identity.sha256 !== sha256)
      throw new Error(
        'Shared cohort emitted file bytes changed after compilation.'
      )
  }
  const metadata = JSON.parse(
    await readFile(
      cohortArtifactPath(root, artifact.cohort.metadataPath),
      'utf8'
    )
  )
  if (
    metadata.cohort?.version !== 1 ||
    JSON.stringify(metadata.cohort.files) !==
      JSON.stringify(artifact.cohort.entries.map((entry) => entry.file))
  )
    throw new Error(
      'Native cohort order evidence does not match its compiler identity.'
    )
}

export async function validateCohortSource(
  artifact: CohortArtifact,
  entry: TestEntry,
  projectDir: string
): Promise<void> {
  const canonicalSource = await realpath(entry.file)
  const path = relative(await realpath(projectDir), canonicalSource)
  if (
    !path ||
    path === '..' ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path) ||
    !(await lstat(entry.file)).isFile()
  )
    throw new Error(
      'Shared cohort sources must be real project-contained files.'
    )
  const sourceHash = createHash('sha256')
    .update(await readFile(entry.file))
    .digest('hex')
  if (sourceHash !== artifact.sourceHash)
    throw new Error(
      'Shared cohort source changed after its immutable compilation.'
    )
}

/** Parent preflight and post-exit validation; no application module is evaluated. */
export async function validateCompiledTestCohort(
  cohort: import('../contracts').CompiledTestCohort,
  entries: readonly TestEntry[],
  projectDir: string
): Promise<void> {
  if (
    cohort.version !== 1 ||
    !Array.isArray(cohort.artifacts) ||
    !cohort.artifacts.length ||
    cohort.artifacts.length !== entries.length
  )
    throw new Error('Invalid compiled shared test cohort membership.')
  const first = cohort.artifacts[0]
  const lease: WorkerLeaseInput = {
    version: 1,
    leaseId: 'validation',
    runId: 'validation',
    rootDir: first.rootDir,
    revision: first.revision,
    profile: first.profile,
  }
  let closure: string | undefined
  for (let index = 0; index < entries.length; index++) {
    const artifact = cohort.artifacts[index]
    assertCohortArtifact(artifact, entries[index], projectDir, lease)
    if (
      artifact.cohort.index !== index ||
      artifact.cohort.entries.length !== entries.length
    )
      throw new Error(
        'Compiled shared cohort membership or dispatch order mismatch.'
      )
    const identity = cohortClosureIdentity(artifact)
    if (closure !== undefined && closure !== identity)
      throw new Error(
        'Compiled shared cohort members have different immutable closures.'
      )
    closure = identity
    await validateCohortSource(artifact, entries[index], projectDir)
  }
  await validateCohortFiles(first as CohortArtifact)
}
