import type { CompiledTestArtifact, TestEntry } from '../contracts'

export function assertArtifactProfile(
  artifact: Pick<
    CompiledTestArtifact,
    'version' | 'kind' | 'entryId' | 'profile'
  >,
  entry: TestEntry
): void {
  if (artifact.version !== 2) {
    throw new Error(
      'Unsupported compiled test artifact version; recompile the test'
    )
  }
  if (
    (artifact.kind !== 'rsc' && artifact.kind !== 'node') ||
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
    artifact.profile.route !== entry.profile.route
  ) {
    throw new Error('Compiled test artifact identity or profile mismatch')
  }
}
