import { createHash } from 'crypto'
import { isAbsolute, join } from 'path'

/** Keep arbitrary test/run names out of filesystem path components. */
export function browserOutputDirectory(
  root: string,
  runId: string,
  entryId: string,
  attemptId: string
): string {
  if (!isAbsolute(root)) {
    throw new Error('Browser attachment outputDir must be absolute')
  }
  const key = createHash('sha256')
    .update(JSON.stringify([runId, entryId, attemptId]))
    .digest('hex')
  return join(root, key)
}
