import type { DiscoveredTestProject } from '../discovery'

/** Shared admission for the qualified one-shot production Browser V8 path. */
export function isProductionBrowserCoverageProject(
  project: DiscoveredTestProject
): boolean {
  const { profile } = project
  return (
    profile.environment === 'browser' &&
    profile.browserClient === true &&
    profile.mode === 'production' &&
    profile.runtime === 'nodejs' &&
    profile.bundler === 'turbopack' &&
    profile.route === undefined &&
    (project.browserEngine === undefined ||
      project.browserEngine === 'chromium') &&
    project.isolate !== false &&
    !project.typecheck?.enabled &&
    !project.executionEnvironment &&
    !project.setupFiles.length &&
    !project.browserFixtures?.length &&
    project.entries.every((entry) => !entry.executionEnvironment)
  )
}

/** One-shot configured development coverage uses the actual dev client graph. */
export function isDevelopmentBrowserCoverageProject(
  project: DiscoveredTestProject
): boolean {
  const { profile } = project
  return (
    profile.environment === 'browser' &&
    profile.browserClient === true &&
    profile.mode === 'development' &&
    profile.runtime === 'nodejs' &&
    profile.bundler === 'turbopack' &&
    profile.route === undefined &&
    (project.browserEngine === undefined ||
      project.browserEngine === 'chromium') &&
    project.isolate !== false &&
    !project.typecheck?.enabled &&
    !project.executionEnvironment &&
    !project.setupFiles.length &&
    !project.browserFixtures?.length &&
    project.entries.every((entry) => !entry.executionEnvironment)
  )
}

/** Restricted project shape for ordinary JavaScript Chromium watch retention. */
export function isDevelopmentBrowserWatchCoverageProject(
  project: DiscoveredTestProject
): boolean {
  return (
    isDevelopmentBrowserCoverageProject(project) &&
    !project.snapshotSerializers?.length &&
    project.entries.every(
      (entry) =>
        !entry.inSource && !entry.typecheck && /\.(?:js|mjs)$/.test(entry.file)
    )
  )
}
