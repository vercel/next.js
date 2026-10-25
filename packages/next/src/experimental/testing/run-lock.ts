import { join } from 'path'

/** The actual public invocation lock is generated output, including in watch. */
export function getTestRunLockPath(projectDir: string): string {
  return join(projectDir, '.next-test-run.lock')
}
