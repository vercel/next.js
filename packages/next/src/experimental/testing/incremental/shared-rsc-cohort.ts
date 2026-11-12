import type { DiscoveredTestProject } from '../discovery'
import type { WatchProcessRequest } from '../watch-process'

/** Initial shared rendering scope; ordinary Node/isolated watch retains its policy. */
export function isSharedRscCohortProject(
  project: DiscoveredTestProject
): boolean {
  const profile = project.profile
  return (
    project.isolate === false &&
    profile.environment === 'rsc' &&
    profile.mode === 'development' &&
    profile.runtime === 'nodejs' &&
    profile.bundler === 'turbopack' &&
    typeof profile.route === 'string' &&
    profile.route.length > 0 &&
    !project.executionEnvironment &&
    !project.setupFiles.length &&
    !project.snapshotSerializers?.length &&
    !project.globalSetup?.length &&
    !project.bail &&
    !project.typecheck?.enabled &&
    !project.customCoverage &&
    project.entries.every(
      (entry) =>
        !entry.typecheck &&
        !entry.inSource &&
        !entry.executionEnvironment &&
        JSON.stringify(entry.profile) === JSON.stringify(profile)
    )
  )
}

/** Derive the exact existing broker capability from actual requested projects. */
export function isSharedRscWatchRun(request: WatchProcessRequest): boolean {
  return (
    request.operation === 'run' &&
    request.isolatedProfile !== true &&
    request.projects.length === 1 &&
    request.projects[0].entries.length > 0 &&
    isSharedRscCohortProject(request.projects[0]) &&
    request.maxWorkers === 1 &&
    !request.collectOnly &&
    !request.inspect &&
    !request.inspectBrk &&
    !request.coverage &&
    !request.standardCoverageOptions &&
    !request.customCoverageRequests &&
    !request.watchCoverage &&
    !request.userCancellation &&
    !request.compilerTransforms &&
    !request.updateSnapshots &&
    (request.snapshotUpdateMode === undefined ||
      request.snapshotUpdateMode === 'none') &&
    !request.captureJUnitSuiteTasks &&
    !request.captureOneShotV8CollectionRestoration &&
    !request.preparePublicSnapshots &&
    !request.captureOneShotV8ReadOnlySnapshots &&
    !request.captureModuleStart &&
    !request.captureModuleQueued &&
    !request.captureModuleCollected
  )
}

/** Shared graph reruns retain all discovered members, in their existing order. */
export function expandSharedRscCohortSelection(
  projects: readonly DiscoveredTestProject[],
  selected: ReadonlySet<string>
): Set<string> {
  const expanded = new Set(selected)
  for (const project of projects) {
    if (
      isSharedRscCohortProject(project) &&
      project.entries.some((entry) => selected.has(entry.id))
    ) {
      for (const entry of project.entries) expanded.add(entry.id)
    }
  }
  return expanded
}
