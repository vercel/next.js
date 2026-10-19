import type { CompiledTestArtifact } from '../contracts'
import type { CoverageArtifactMetadata } from './types'
import { coverageHash, readArtifactFile } from './artifact'

type Proof = NonNullable<CoverageArtifactMetadata['sourcePreservation']>
function sourceCoveragePath(entryPath: string) {
  if (!/^server\/next-test\/[a-f0-9]{64}\.js$/.test(entryPath))
    throw new Error('Invalid native source coverage entry identity.')
  return entryPath.replace(/\.js$/, '.source-coverage.json')
}
function validateSourceCoverageBytes(bytes: Buffer) {
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid native source coverage certificate.')
  const {
    version,
    kind,
    mode,
    sourceMaps,
    preserveOriginalSyntax,
    ...unknown
  } = value as Record<string, unknown>
  if (
    version !== 1 ||
    kind !== 'node-source-coverage' ||
    mode !== 'production' ||
    sourceMaps !== 'absolute-file-uri' ||
    preserveOriginalSyntax !== true ||
    Object.keys(unknown).length
  )
    throw new Error('Invalid native source coverage compilation contract.')
}

/** Issued only by the separately negotiated native source-preserving context. */
export async function readSourceCoverageProof(
  rootDir: string,
  entryPath: string,
  files: readonly string[]
): Promise<Proof> {
  const path = sourceCoveragePath(entryPath)
  if (!files.includes(path))
    throw new Error('Missing native source coverage certificate.')
  const bytes = await readArtifactFile(rootDir, path)
  validateSourceCoverageBytes(bytes)
  return { version: 1, nativeMetadata: { path, sha256: coverageHash(bytes) } }
}

/** No production profile is admitted merely because a parent requests coverage. */
export function assertSourceCoverageArtifact(artifact: CompiledTestArtifact) {
  const proof = artifact.coverage?.sourcePreservation
  if (
    artifact.version !== 2 ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.mode !== 'production' ||
    artifact.profile.route !== undefined ||
    artifact.moduleMocking ||
    artifact.moduleCache ||
    artifact.cohort ||
    proof?.version !== 1 ||
    proof.nativeMetadata?.path !== sourceCoveragePath(artifact.entryPath) ||
    !artifact.files.includes(proof.nativeMetadata.path) ||
    !/^[a-f0-9]{64}$/.test(proof.nativeMetadata.sha256)
  )
    throw new Error(
      'Production coverage requires native source-preserving Node compilation.'
    )
}

/** Recheck the native contract while retaining the immutable output lease. */
export async function verifySourceCoverageArtifact(
  artifact: CompiledTestArtifact
) {
  assertSourceCoverageArtifact(artifact)
  const actual = await readSourceCoverageProof(
    artifact.rootDir,
    artifact.entryPath,
    artifact.files
  )
  if (
    JSON.stringify(actual) !==
    JSON.stringify(artifact.coverage!.sourcePreservation)
  )
    throw new Error(
      'Native source coverage certificate changed after compilation.'
    )
}
