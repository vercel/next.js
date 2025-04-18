import * as path from 'node:path'
import { getCurrentTestContext } from './jest-reflection'

export function getCurrentTestTraceOutputDir() {
  const testContext = getCurrentTestContext()
  const testRootDir = testContext.rootDir
  const traceDir = path.join(testRootDir, 'traces')
  const traceSubDir = testContext.testPathRelativeToTestDir.replace(/\//g, '--')
  return path.join(traceDir, traceSubDir)
}
