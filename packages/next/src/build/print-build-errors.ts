import {
  formatIssue,
  isRelevantWarning,
} from '../shared/lib/turbopack/format-issue'
import type { TurbopackResult } from './swc/types'

/**
 * Processes and reports build issues from Turbopack entrypoints.
 *
 * @param entrypoints - The result object containing build issues to process.
 * @param isDev - A flag indicating if the build is running in development mode.
 * @return This function does not return a value but logs or throws errors based on the issues.
 * @throws {Error} If a fatal issue is encountered, this function throws an error. In development mode, we only throw on
 *                 'fatal' and 'bug' issues. In production mode, we also throw on 'error' issues.
 */
export function printBuildErrors(
  entrypoints: TurbopackResult,
  isDev: boolean
): void {
  // Issues that we want to stop the server from executing
  const topLevelFatalIssues = []
  // Issues that are true errors, but we believe we can keep running and allow the user to address the issue
  const topLevelErrors = []
  // Issues that are warnings but should not affect the running of the build
  const topLevelWarnings = []

  // Track seen formatted error messages to avoid duplicates
  const seenFatalIssues = new Set<string>()
  const seenErrors = new Set<string>()
  const seenWarnings = new Set<string>()

  for (const issue of entrypoints.issues) {
    // We only want to completely shut down the server
    if (issue.severity === 'fatal' || issue.severity === 'bug') {
      const formatted = formatIssue(issue)
      if (!seenFatalIssues.has(formatted)) {
        seenFatalIssues.add(formatted)
        topLevelFatalIssues.push(formatted)
      }
    } else if (isRelevantWarning(issue)) {
      const formatted = formatIssue(issue)
      if (!seenWarnings.has(formatted)) {
        seenWarnings.add(formatted)
        topLevelWarnings.push(formatted)
      }
    } else if (issue.severity === 'error') {
      const formatted = formatIssue(issue)
      if (isDev) {
        // We want to treat errors as recoverable in development
        // so that we can show the errors in the site and allow users
        // to respond to the errors when necessary. In production builds
        // though we want to error out and stop the build process.
        if (!seenErrors.has(formatted)) {
          seenErrors.add(formatted)
          topLevelErrors.push(formatted)
        }
      } else {
        if (!seenFatalIssues.has(formatted)) {
          seenFatalIssues.add(formatted)
          topLevelFatalIssues.push(formatted)
        }
      }
    }
  }
  // TODO: print in order by source location so issues from the same file are displayed together and then add a summary at the end about the number of warnings/errors
  if (topLevelWarnings.length > 0) {
    console.warn(
      `Turbopack build encountered ${
        topLevelWarnings.length
      } warnings:\n${topLevelWarnings.join('\n')}`
    )
  }

  if (topLevelErrors.length > 0) {
    console.error(
      `Turbopack build encountered ${
        topLevelErrors.length
      } errors:\n${topLevelErrors.join('\n')}`
    )
  }

  if (topLevelFatalIssues.length > 0) {
    throw new Error(
      `Turbopack build failed with ${
        topLevelFatalIssues.length
      } errors:\n${topLevelFatalIssues.join('\n')}`
    )
  }
}
