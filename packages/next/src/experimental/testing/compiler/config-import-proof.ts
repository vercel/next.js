import { lstat, realpath, writeFile } from 'fs/promises'
import { join } from 'path'
import { isDeepStrictEqual } from 'util'
import type { CompiledTestArtifact } from '../contracts'
import { coverageHash, readArtifactFile } from '../coverage/artifact'
import { assertConfigurationImportFiles } from './config-import-facts'
import { assertBrowserCoverageArtifact } from '../client/coverage-artifact'
import type { ConfigurationImportFiles } from './config-imports'

/** The parent authorizes this exact ordinary Next config selection and request. */
export interface ConfigurationImportAuthorization {
  id: string
  configFile: string | null
}

export interface ConfigurationImportProof {
  path: string
  sha256: string
}

function identity(
  artifact: CompiledTestArtifact,
  authorization: ConfigurationImportAuthorization
) {
  return {
    version: 1,
    kind: 'next-config-module-imports',
    request: authorization,
    artifactRoot: artifact.rootDir,
    entryId: artifact.entryId,
    revision: artifact.revision,
    profile: artifact.profile,
    sourceHash: artifact.sourceHash,
    source: artifact.coverage?.sourceAnalysis,
  }
}

async function assertBrowserSourceProof(
  artifact: CompiledTestArtifact,
  requireFile: boolean
) {
  if (artifact.kind !== 'browser') return
  const path = 'next-test-configuration-imports.json'
  if (
    !(
      (artifact.profile.mode === 'production' &&
        artifact.coverage?.browser?.version === 2) ||
      (artifact.profile.mode === 'development' &&
        artifact.coverage?.browser?.version === 1 &&
        /\.(?:ts|mts|[jt]sx)$/.test(
          artifact.coverage.sourceAnalysis?.file ?? ''
        ) &&
        !/\.d\.(?:ts|mts|tsx)$/.test(
          artifact.coverage.sourceAnalysis?.file ?? ''
        ))
    ) ||
    !artifact.coverage.sourceAnalysis ||
    artifact.files.includes(path) ||
    artifact.client.outputs.some((output) => output.path === path)
  )
    throw new Error(
      'Browser declaration config proof lost its private source role'
    )
  await assertBrowserCoverageArtifact(artifact)
  if (requireFile) {
    const file = join(artifact.rootDir, path)
    if (!(await lstat(file)).isFile() || (await realpath(file)) !== file)
      throw new Error(
        'Browser declaration config proof requires its regular private file'
      )
  }
}

/** Called before the source artifact is released to its parent consumer. */
export async function writeConfigurationImportProof(
  artifact: CompiledTestArtifact,
  authorization: ConfigurationImportAuthorization,
  imports: ConfigurationImportFiles,
  signal: AbortSignal
): Promise<ConfigurationImportProof> {
  const graph = await assertConfigurationImportFiles(
    imports,
    authorization.configFile,
    signal
  )
  if (
    typeof authorization.id !== 'string' ||
    !authorization.id ||
    !artifact.coverage?.sourceAnalysis
  )
    throw new Error(
      'Next config module proof requires a parent source request.'
    )
  const path = 'next-test-configuration-imports.json'
  if (artifact.files.includes(path))
    throw new Error('Next config module proof collides with emitted output.')
  if (artifact.kind === 'browser')
    await assertBrowserSourceProof(artifact, false)
  const bytes = JSON.stringify({ ...identity(artifact, authorization), graph })
  await writeFile(join(artifact.rootDir, path), bytes, { flag: 'wx', signal })
  if (artifact.kind === 'browser')
    await assertBrowserSourceProof(artifact, true)
  else {
    artifact.files.push(path)
    artifact.files.sort()
  }
  await assertConfigurationImportFiles(graph, authorization.configFile, signal)
  return { path, sha256: coverageHash(bytes) }
}

/** Read only under the parent's exact artifact/profile/revision/source lease. */
export async function readConfigurationImportProof(
  artifact: CompiledTestArtifact,
  reference: ConfigurationImportProof | undefined,
  authorization: ConfigurationImportAuthorization | undefined,
  signal: AbortSignal
): Promise<ConfigurationImportFiles | undefined> {
  if (!authorization) {
    if (reference)
      throw new Error('Unrequested Next config module import proof.')
    return undefined
  }
  if (
    typeof authorization.id !== 'string' ||
    !authorization.id ||
    !reference ||
    Object.keys(reference).sort().join(',') !== 'path,sha256' ||
    reference.path !== 'next-test-configuration-imports.json' ||
    !/^[a-f0-9]{64}$/.test(reference.sha256) ||
    (artifact.kind !== 'browser' && !artifact.files.includes(reference.path)) ||
    !artifact.coverage?.sourceAnalysis
  )
    throw new Error('Missing or incompatible Next config module import proof.')
  if (artifact.kind === 'browser')
    await assertBrowserSourceProof(artifact, true)
  const bytes = await readArtifactFile(artifact.rootDir, reference.path)
  if (coverageHash(bytes) !== reference.sha256)
    throw new Error('Next config module import proof bytes changed.')
  const value = JSON.parse(bytes.toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Next config module import proof.')
  const { graph, ...actualIdentity } = value
  if (!isDeepStrictEqual(actualIdentity, identity(artifact, authorization)))
    throw new Error(
      'Next config module import proof lacks parent authorization.'
    )
  return assertConfigurationImportFiles(graph, authorization.configFile, signal)
}
