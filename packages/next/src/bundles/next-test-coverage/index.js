// Pure V8/source-map conversion; this bundle owns no test runtime or compiler.
export { convert } from 'ast-v8-to-istanbul'
import { createCoverageMap } from '@vitest/istanbul-lib-coverage'
import {
  createAsync,
  createContext,
  FileWriter,
} from '@vitest/istanbul-lib-report'

/** Pure reports over the already validated coverage map; no runner is loaded. */
export async function writeReports(data, directory, reporters, options = {}) {
  const context = createContext({
    dir: directory,
    coverageMap: createCoverageMap(data),
  })
  // Load report implementations before starting the synchronous writer capture.
  const reports = await Promise.all(
    reporters.map((name) => createAsync(name, options[name]))
  )
  FileWriter.startCapture()
  FileWriter.resetOutput()
  try {
    for (const report of reports) report.execute(context)
    return FileWriter.getOutput()
  } finally {
    FileWriter.stopCapture()
    FileWriter.resetOutput()
  }
}
