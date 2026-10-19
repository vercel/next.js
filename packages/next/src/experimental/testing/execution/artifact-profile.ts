import type { CompiledTestArtifact, TestEntry } from '../contracts'

export function assertArtifactProfile(
  artifact: Pick<
    CompiledTestArtifact,
    'version' | 'kind' | 'entryId' | 'profile' | 'coverage'
  >,
  entry: TestEntry
): void {
  if (artifact.coverage?.sourceAnalysis)
    throw new Error('Compile-only coverage sources cannot be executed')
  if (artifact.version !== 2) {
    throw new Error(
      'Unsupported compiled test artifact version; recompile the test'
    )
  }
  if (
    (artifact.kind !== 'rsc' &&
      artifact.kind !== 'node' &&
      artifact.kind !== 'browser') ||
    (artifact.kind === 'browser' &&
      (artifact.profile.environment !== 'browser' ||
        artifact.profile.browserClient !== true ||
        artifact.profile.mode !== 'development')) ||
    (artifact.kind === 'node' &&
      artifact.profile.browserClient !== undefined) ||
    (artifact.kind === 'rsc' && artifact.profile.environment !== 'rsc') ||
    (artifact.kind === 'node' &&
      artifact.profile.environment !== 'node' &&
      artifact.profile.environment !== 'browser')
  ) {
    throw new Error('Compiled test artifact kind does not match its profile')
  }
  if (
    artifact.entryId !== entry.id ||
    artifact.profile.id !== entry.profile.id ||
    artifact.profile.mode !== entry.profile.mode ||
    artifact.profile.environment !== entry.profile.environment ||
    artifact.profile.runtime !== entry.profile.runtime ||
    artifact.profile.bundler !== entry.profile.bundler ||
    artifact.profile.route !== entry.profile.route ||
    artifact.profile.browserClient !== entry.profile.browserClient
  ) {
    throw new Error('Compiled test artifact identity or profile mismatch')
  }
}
