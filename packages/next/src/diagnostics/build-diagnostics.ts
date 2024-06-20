import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { traceGlobals } from '../trace/shared'

const DIAGNOSTICS_DIR = 'diagnostics'
const DIAGNOSTICS_FILE = 'build-diagnostics.json'

interface BuildDiagnostics {
  // The current stage of the build process. This should be updated as the
  // build progresses so it's what stage the build was in when an error
  // happened.
  buildStage?: string
  // Additional debug information about the configuration for the build.
  buildOptions?: Record<string, string>
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const res = await stat(path)
    return res.isFile()
  } catch {
    return false
  }
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
  const frameworkVersionFile = join(diagnosticsDir, 'framework.json')
  await writeFile(frameworkVersionFile, JSON.stringify({ version }))
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

  let existingDiagnostics: BuildDiagnostics = {}
  if (await fileExists(diagnosticsFile)) {
    existingDiagnostics = JSON.parse(
      await readFile(diagnosticsFile, 'utf8')
    ) as BuildDiagnostics
  }
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
