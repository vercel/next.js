import { relative } from 'node:path'
import type { DiscoveredTestProject } from '../discovery'
import type { CustomCoverageFact, CustomCoverageRequest } from './custom-types'

/** Validate the complete selected ownership set before forwarding any payload. */
export function assertCustomCoverageFacts(
  value: unknown,
  projectDir: string,
  projects: DiscoveredTestProject[],
  requests: Record<string, CustomCoverageRequest>,
  revisions?: ReadonlyMap<string, string>,
  runId?: string
): CustomCoverageFact[] {
  if (!Array.isArray(value)) throw new Error('Missing custom coverage facts.')
  const expected = new Map(
    projects.flatMap((project) =>
      requests[project.profile.id]
        ? project.entries.map(
            (entry) =>
              [
                entry.id,
                { entry, project, request: requests[project.profile.id] },
              ] as const
          )
        : []
    )
  )
  const seen = new Set<string>()
  for (const fact of value as CustomCoverageFact[]) {
    const completion = fact?.completion
    const owner = completion && expected.get(completion.entryId)
    if (
      !owner ||
      seen.has(completion.entryId) ||
      !completion.complete ||
      completion.version !== 1 ||
      completion.kind !== 'custom' ||
      typeof completion.runId !== 'string' ||
      !completion.runId ||
      (runId !== undefined && completion.runId !== runId) ||
      typeof completion.revision !== 'string' ||
      !completion.revision ||
      (revisions &&
        revisions.get(completion.entryId) !== completion.revision) ||
      completion.provider?.file !== owner.request.provider.file ||
      completion.provider?.sha256 !== owner.request.provider.sha256 ||
      !Object.hasOwn(completion, 'payload') ||
      'error' in completion ||
      fact.environment !== 'ssr' ||
      fact.projectName !== owner.project.displayName ||
      !Array.isArray(fact.testFiles) ||
      fact.testFiles.length !== 1 ||
      fact.testFiles[0] !==
        relative(projectDir, owner.entry.file).replaceAll('\\', '/')
    )
      throw new Error(
        'Invalid, duplicate or incomplete custom coverage ownership facts.'
      )
    // Validate serializability without converting provider-owned payloads.
    structuredClone(completion.payload)
    seen.add(completion.entryId)
  }
  if (seen.size !== expected.size)
    throw new Error('Custom coverage is missing selected files.')
  return value as CustomCoverageFact[]
}
