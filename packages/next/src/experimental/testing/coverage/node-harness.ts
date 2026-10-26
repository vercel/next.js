import { realpath } from 'fs/promises'
import { isAbsolute, resolve } from 'path'
import { isDeepStrictEqual } from 'util'
import type { CompiledTestArtifact, TestProfile } from '../contracts'
import { readArtifactFile } from './artifact'
import {
  readIstanbulHarnessCoverage,
  validateIstanbulHarnessCoverage,
} from './istanbul-harness'

export function isNodeHarnessProfile(profile: TestProfile): boolean {
  return (
    profile.mode === 'development' &&
    profile.environment === 'node' &&
    profile.route === undefined &&
    profile.browserClient === undefined
  )
}

function eligible(artifact: CompiledTestArtifact): boolean {
  return (
    artifact.kind === 'node' &&
    isNodeHarnessProfile(artifact.profile) &&
    !artifact.cohort &&
    !artifact.moduleMocking &&
    !artifact.moduleCache &&
    !artifact.dynamicModuleMocking &&
    !artifact.sourceDependencies &&
    !artifact.coverage?.istanbul
  )
}

export function assertNodeHarnessArtifact(
  artifact: CompiledTestArtifact
): void {
  const value = artifact.coverage?.nodeHarness
  if (value === undefined) return
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !eligible(artifact) ||
    artifact.coverage?.istanbulHarness ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'projectDir') ||
    !Object.hasOwn(value, 'harness') ||
    typeof value.projectDir !== 'string' ||
    !isAbsolute(value.projectDir) ||
    resolve(value.projectDir) !== value.projectDir
  )
    throw new Error('Unrequested native Node harness coverage.')
  validateIstanbulHarnessCoverage(value.harness)
}

/** Re-read the actual Native sidecar through its still-owned immutable lease. */
export async function verifyNodeHarnessCoverage(
  artifact: CompiledTestArtifact
): Promise<void> {
  assertNodeHarnessArtifact(artifact)
  if (!eligible(artifact)) return
  const value = artifact.coverage?.nodeHarness
  const path = artifact.entryPath.replace(/\.js$/, '.harness-coverage.json')
  if (!value) {
    if (
      artifact.setupFiles?.length ||
      artifact.snapshotSerializers?.length ||
      artifact.files.includes(path)
    )
      throw new Error('Missing native Node harness coverage.')
    return
  }
  if ((await realpath(value.projectDir)) !== value.projectDir)
    throw new Error('Native Node harness project changed.')
  const actual = await readIstanbulHarnessCoverage({
    entryPath: artifact.entryPath,
    files: artifact.files,
    projectDir: value.projectDir,
    setupFiles: artifact.setupFiles ?? [],
    snapshotSerializers: artifact.snapshotSerializers ?? [],
    signal: new AbortController().signal,
    readArtifact: (file) => readArtifactFile(artifact.rootDir, file),
  })
  if (!isDeepStrictEqual(actual, value.harness))
    throw new Error('Native Node harness metadata or requests changed.')
  for (const source of actual?.sources ?? [])
    if (
      !Object.hasOwn(artifact.coverage!.sources, source.source) ||
      artifact.coverage!.sources[source.source] !== null
    )
      throw new Error(
        'Authored and generated Node harness sources are ambiguous.'
      )
}
