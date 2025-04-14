import * as path from 'node:path'

export function getCurrentTestTraceOutputDir() {
  if (!process.env.TEST_FILE_PATH) {
    throw new Error('Expected `process.env.TEST_FILE_PATH` to be set')
  }
  const testRootDir = path.resolve(__dirname, '..')
  const traceDir = path.join(testRootDir, 'traces')
  const testPathRelativeToTestDir = path.relative(
    testRootDir,
    process.env.TEST_FILE_PATH
  )
  const traceSubDir = testPathRelativeToTestDir.replace(/\//g, '--')
  return path.join(traceDir, traceSubDir)
}
