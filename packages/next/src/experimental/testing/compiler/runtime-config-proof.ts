import { readCoverageInput } from '../coverage/source-analysis-plan'
import { lstat, realpath, writeFile } from 'fs/promises'
import { join } from 'path'
import { isDeepStrictEqual } from 'util'
import type { CompiledTestArtifact } from '../contracts'
import { coverageHash, readArtifactFile } from '../coverage/artifact'
import { assertConfigurationImportFiles } from './config-import-facts'
import { assertBrowserCoverageArtifact } from '../client/coverage-artifact'
import type {
  ConfigurationImportAuthorization,
  ConfigurationImportProof,
} from './config-import-proof'
import type { ConfigurationImportFiles } from './config-imports'

export interface RuntimeConfigurationEntry {
  id: string
  file: string
  sha256: string
  /** Parent allocated before the native endpoint is created. */
  revision: string
}

const path = 'next-test-runtime-configuration-imports.json'

function assertRuntimeArtifact(
  artifact: CompiledTestArtifact,
  entry: RuntimeConfigurationEntry
) {
  if (
    artifact.version !== 2 ||
    !(
      (artifact.kind === 'node' &&
        artifact.profile.environment === 'node' &&
        !artifact.profile.browserClient) ||
      (artifact.kind === 'browser' &&
        artifact.profile.environment === 'browser' &&
        artifact.profile.browserClient === true)
    ) ||
    artifact.profile.runtime !== 'nodejs' ||
    artifact.profile.bundler !== 'turbopack' ||
    artifact.profile.route !== undefined ||
    !['development', 'production'].includes(artifact.profile.mode) ||
    (artifact.profile.environment === 'browser' &&
      artifact.profile.mode === 'production' &&
      artifact.coverage?.browser?.version !== 2) ||
    artifact.entryId !== entry.id ||
    artifact.sourceHash !== entry.sha256 ||
    !entry.revision ||
    artifact.revision !== entry.revision ||
    !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    artifact.coverage?.version !== 1 ||
    artifact.coverage.sourceAnalysis ||
    ('cohort' in artifact && artifact.cohort)
  )
    throw new Error(
      'Runtime config imports require a runtime coverage artifact.'
    )
}

function identity(
  artifact: CompiledTestArtifact,
  authorization: ConfigurationImportAuthorization,
  entry: RuntimeConfigurationEntry
) {
  return {
    version: 1,
    kind: 'next-runtime-config-module-imports',
    request: authorization,
    artifactRoot: artifact.rootDir,
    entryId: artifact.entryId,
    revision: artifact.revision,
    profile: artifact.profile,
    source: entry,
  }
}

/** Parent-authored proof is pinned separately from the native browser closure. */
async function assertPrivateBrowserProof(
  artifact: CompiledTestArtifact,
  requireFile: boolean
) {
  if (artifact.kind !== 'browser') return
  if (artifact.profile.mode === 'production')
    await assertBrowserCoverageArtifact(artifact)
  if (
    artifact.files.includes(path) ||
    artifact.client.outputs.some((output) => output.path === path)
  )
    throw new Error(
      'Runtime config proof collides with native Browser Mode output.'
    )
  if (
    (await realpath(artifact.rootDir)) !== artifact.rootDir ||
    !(await lstat(artifact.rootDir)).isDirectory()
  )
    throw new Error(
      'Runtime config proof lacks its canonical Browser Mode root.'
    )
  if (requireFile) {
    const file = join(artifact.rootDir, path)
    if (!(await lstat(file)).isFile() || (await realpath(file)) !== file)
      throw new Error(
        'Runtime config proof requires its private regular Browser Mode file.'
      )
  }
}

/** Distinct runtime role; source-analysis permission never authorizes this file. */
export async function writeRuntimeConfigurationImportProof(
  artifact: CompiledTestArtifact,
  authorization: ConfigurationImportAuthorization,
  entry: RuntimeConfigurationEntry,
  graph: ConfigurationImportFiles,
  signal: AbortSignal
): Promise<ConfigurationImportProof> {
  assertRuntimeArtifact(artifact, entry)
  if ((await readCoverageInput(entry.file, signal)).sha256 !== entry.sha256)
    throw new Error(
      'Runtime config entry source changed after parent selection.'
    )
  if (typeof authorization.id !== 'string' || !authorization.id)
    throw new Error('Runtime config imports require a parent request.')
  await assertConfigurationImportFiles(graph, authorization.configFile, signal)
  if (artifact.files.includes(path))
    throw new Error('Runtime config proof collides with emitted output.')
  await assertPrivateBrowserProof(artifact, false)
  const bytes = JSON.stringify({
    ...identity(artifact, authorization, entry),
    graph,
  })
  await writeFile(join(artifact.rootDir, path), bytes, { flag: 'wx', signal })
  if (artifact.kind === 'browser')
    await assertPrivateBrowserProof(artifact, true)
  else {
    artifact.files.push(path)
    artifact.files.sort()
  }
  await assertConfigurationImportFiles(graph, authorization.configFile, signal)
  return { path, sha256: coverageHash(bytes) }
}

/** Parent reads both before evaluation and after cleanup under the same lease. */
export async function readRuntimeConfigurationImportProof(
  artifact: CompiledTestArtifact,
  reference: ConfigurationImportProof | undefined,
  authorization: ConfigurationImportAuthorization,
  entry: RuntimeConfigurationEntry,
  signal: AbortSignal
): Promise<ConfigurationImportFiles> {
  assertRuntimeArtifact(artifact, entry)
  if ((await readCoverageInput(entry.file, signal)).sha256 !== entry.sha256)
    throw new Error(
      'Runtime config entry source changed after parent selection.'
    )
  if (
    typeof authorization.id !== 'string' ||
    !authorization.id ||
    !reference ||
    Object.keys(reference).sort().join(',') !== 'path,sha256' ||
    reference.path !== path ||
    !/^[a-f0-9]{64}$/.test(reference.sha256) ||
    (artifact.kind !== 'browser' && !artifact.files.includes(path))
  )
    throw new Error('Missing or incompatible runtime config module proof.')
  await assertPrivateBrowserProof(artifact, true)
  const bytes = await readArtifactFile(artifact.rootDir, path)
  await assertPrivateBrowserProof(artifact, true)
  if (coverageHash(bytes) !== reference.sha256)
    throw new Error('Runtime config module proof bytes changed.')
  const value = JSON.parse(bytes.toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid runtime config module proof.')
  const { graph, ...actual } = value
  if (!isDeepStrictEqual(actual, identity(artifact, authorization, entry)))
    throw new Error('Runtime config module proof lacks parent authorization.')
  return assertConfigurationImportFiles(graph, authorization.configFile, signal)
}
