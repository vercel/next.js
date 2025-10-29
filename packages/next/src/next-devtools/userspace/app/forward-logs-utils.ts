import { configure } from 'next/dist/compiled/safe-stable-stringify'
import { getTerminalLoggingConfig } from './terminal-logging-config'
import { UNDEFINED_MARKER } from '../../shared/forward-logs-shared'

const terminalLoggingConfig = getTerminalLoggingConfig()

const PROMISE_MARKER = 'Promise {}'
const UNAVAILABLE_MARKER = '[Unable to view]'

const maximumDepth =
  typeof terminalLoggingConfig === 'object' && terminalLoggingConfig.depthLimit
    ? terminalLoggingConfig.depthLimit
    : 5
const maximumBreadth =
  typeof terminalLoggingConfig === 'object' && terminalLoggingConfig.edgeLimit
    ? terminalLoggingConfig.edgeLimit
    : 100

export const safeStringifyWithDepth = configure({
  maximumDepth,
  maximumBreadth,
})

/**
 * allows us to:
 * - revive the undefined log in the server as it would look in the browser
 * - not read/attempt to serialize promises (next will console error if you do that, and will cause this program to infinitely recurse)
 * - if we read a proxy that throws (no way to detect if something is a proxy), explain to the user we can't read this data
 */
export function preLogSerializationClone<T>(
  value: T,
  seen = new WeakMap()
): any {
  if (value === undefined) return UNDEFINED_MARKER
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return seen.get(value as object)

  try {
    Object.keys(value as object)
  } catch {
    return UNAVAILABLE_MARKER
  }

  try {
    if (typeof (value as any).then === 'function') return PROMISE_MARKER
  } catch {
    return UNAVAILABLE_MARKER
  }

  if (Array.isArray(value)) {
    const out: any[] = []
    seen.set(value, out)
    for (const item of value) {
      try {
        out.push(preLogSerializationClone(item, seen))
      } catch {
        out.push(UNAVAILABLE_MARKER)
      }
    }
    return out
  }

  const proto = Object.getPrototypeOf(value)
  if (proto === Object.prototype || proto === null) {
    const out: Record<string, unknown> = {}
    seen.set(value as object, out)
    for (const key of Object.keys(value as object)) {
      try {
        out[key] = preLogSerializationClone((value as any)[key], seen)
      } catch {
        out[key] = UNAVAILABLE_MARKER
      }
    }
    return out
  }

  return Object.prototype.toString.call(value)
}

// only safe if passed safeClone data
export const logStringify = (data: unknown): string => {
  try {
    const result = safeStringifyWithDepth(data)
    return result ?? `"${UNAVAILABLE_MARKER}"`
  } catch {
    return `"${UNAVAILABLE_MARKER}"`
  }
}
