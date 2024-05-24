import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { traceGlobals } from '../trace/shared'

const DIAGNOSTICS_DIR = 'diagnostics'
const DIAGNOSTICS_FILE = 'build-diagnostics.json'

interface BuildDiagnostics {
  version?: string
  buildStage?: string
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

/**
 *
 */
export async function updateBuildDiagnostics(
  diagnostics: BuildDiagnostics
): Promise<void> {
  const distDir = traceGlobals.get('distDir')
  const diagnosticsDir = join(distDir, DIAGNOSTICS_DIR)
  const diagnosticsFile = join(diagnosticsDir, DIAGNOSTICS_FILE)
  await mkdir(join(distDir, DIAGNOSTICS_DIR), { recursive: true })
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
