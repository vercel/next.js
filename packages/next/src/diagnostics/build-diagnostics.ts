import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { traceGlobals } from '../trace/shared'
import type { ExportAppResult } from '../export/types'
import type { FetchMetrics } from '../server/base-http'

const DIAGNOSTICS_DIR = 'diagnostics'
const DIAGNOSTICS_FILE = 'build-diagnostics.json'
const FETCH_METRICS_FILE = 'fetch-metrics.json'
const INCREMENTAL_BUILDS_FILE = 'incremental-build-diagnostics.json'
const FRAMEWORK_VERSION_FILE = 'framework.json'

interface BuildDiagnostics {
  // The current stage of the build process. This should be updated as the
  // build progresses so it's what stage the build was in when an error
  // happened.
  buildStage?: string
  // Additional debug information about the configuration for the build.
  buildOptions?: Record<string, string>
}

async function getDiagnosticsDir(): Promise<string> {
  const distDir = traceGlobals.get('distDir')
  const diagnosticsDir = join(distDir, DIAGNOSTICS_DIR)
  await mkdir(diagnosticsDir, { recursive: true })
  return diagnosticsDir
}

/**
 * Saves the exact version of Next.js that was used to build the app to a diagnostics file.
 */
export async function recordFrameworkVersion(version: string): Promise<void> {
  const diagnosticsDir = await getDiagnosticsDir()
  const frameworkVersionFile = join(diagnosticsDir, FRAMEWORK_VERSION_FILE)
  await writeFile(
    frameworkVersionFile,
    JSON.stringify({ name: 'Next.js', version })
  )
}

/**
 * Saves build diagnostics information to a file. This method can be called
 * multiple times during a build to save additional information that can help
 * debug a build such as what stage the build was in when a failure happened.
 * Each time this method is called, the new information will be merged with any
 * existing build diagnostics that previously existed.
 */
export async function updateBuildDiagnostics(
  diagnostics: BuildDiagnostics
): Promise<void> {
  const diagnosticsDir = await getDiagnosticsDir()
  const diagnosticsFile = join(diagnosticsDir, DIAGNOSTICS_FILE)

  const existingDiagnostics: BuildDiagnostics = JSON.parse(
    await readFile(diagnosticsFile, 'utf8').catch(() => '{}')
  ) as BuildDiagnostics
  const updatedBuildOptions = {
    ...(existingDiagnostics.buildOptions ?? {}),
    ...(diagnostics.buildOptions ?? {}),
  }
  const updatedDiagnostics = {
    ...existingDiagnostics,
    ...diagnostics,
    buildOptions: updatedBuildOptions,
  }
  await writeFile(diagnosticsFile, JSON.stringify(updatedDiagnostics, null, 2))
}

/**
 * Writes fetch metrics collected during static generation to a file.
 */
export async function recordFetchMetrics(
  exportResult: ExportAppResult
): Promise<void> {
  const diagnosticsDir = await getDiagnosticsDir()
  const diagnosticsFile = join(diagnosticsDir, FETCH_METRICS_FILE)
  const fetchMetricsByPath: Record<string, FetchMetrics> = {}

  for (const [appPath, { fetchMetrics }] of exportResult.byPath) {
    if (fetchMetrics) {
      fetchMetricsByPath[appPath] = fetchMetrics
    }
  }

  return writeFile(diagnosticsFile, JSON.stringify(fetchMetricsByPath, null, 2))
}

interface IncrementalBuildDiagnostics {
  changedAppPaths?: string[]
  unchangedAppPaths?: string[]
  changedPagePaths?: string[]
  unchangedPagePaths?: string[]
  changedDependencies?: Record<string, string>
  shuttleGitSha?: string
  currentGitSha?: string
}

/**
 * Writes incremental build metrics to a file.
 */
export async function updateIncrementalBuildMetrics(
  diagnostics: IncrementalBuildDiagnostics
): Promise<void> {
  const diagnosticsDir = await getDiagnosticsDir()
  const diagnosticsFile = join(diagnosticsDir, INCREMENTAL_BUILDS_FILE)

  const existingDiagnostics: IncrementalBuildDiagnostics = JSON.parse(
    await readFile(diagnosticsFile, 'utf8').catch(() => '{}')
  ) as IncrementalBuildDiagnostics

  const updatedDiagnostics = {
    ...existingDiagnostics,
    ...diagnostics,
  }
  await writeFile(diagnosticsFile, JSON.stringify(updatedDiagnostics, null, 2))
}
