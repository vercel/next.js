import { configure } from 'next/dist/compiled/safe-stable-stringify'
import { dim } from '../../lib/picocolors'

// Configure stringify with reasonable limits for action logging
const stringify = configure({
  maximumDepth: 2,
  maximumBreadth: 3,
})

/**
 * Format a single argument for display in server action logs.
 */
function formatArg(arg: unknown): string {
  try {
    return stringify(arg) ?? String(arg)
  } catch {
    // String(arg) can throw for temporary client references (e.g., class instances
    // passed from client to server) because accessing .toString() on them throws
    // "Cannot access toString on the server"
    try {
      return String(arg)
    } catch {
      return '[unserializable]'
    }
  }
}

/**
 * Format arguments array to a string for display
 */
export function formatArgs(args: unknown[]): string {
  return args.map((a) => formatArg(a)).join(', ')
}

export interface ServerActionLogInfo {
  functionName: string
  args: unknown[]
  location: string
}

/**
 * Log server action invocation with function name, arguments and location.
 * Only used in development mode.
 */
export function logServerAction(
  info: ServerActionLogInfo,
  startTime: number
): void {
  const duration = Math.round(performance.now() - startTime)
  const argsStr = formatArgs(info.args)
  console.log(
    `   └─ ƒ ${info.functionName}(${argsStr}) in ${duration}ms ${dim(info.location)}`
  )
}
