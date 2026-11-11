import type { TaskLocation } from '../runner/tasks'
import type { createClientSourceMapResolver } from './source-maps'

/** Retain Gecko's actual call column, including srcScript map identities. */
export function getClientDeclarationLocation(
  error: Error,
  mapper: Pick<ReturnType<typeof createClientSourceMapResolver>, 'mapLocation'>
): TaskLocation | undefined {
  let stack: unknown
  try {
    stack = error.stack
  } catch {
    return
  }
  if (typeof stack !== 'string') return
  for (const line of stack.split('\n')) {
    const match = /(https?:\/\/.+):(\d+):(\d+)\)?$/.exec(line)
    if (!match) continue
    try {
      const mapped = mapper.mapLocation({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
      })
      return { line: mapped.line, column: mapped.column }
    } catch {
      // Only compiler-issued maps containing this selected test source qualify.
    }
  }
}
