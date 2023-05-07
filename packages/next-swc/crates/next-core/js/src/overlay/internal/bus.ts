import { StackFrame } from 'stacktrace-parser'

import type { Issue } from '@vercel/turbopack-dev/types/protocol'

export const TYPE_BUILD_OK = 'build-ok'
export const TYPE_TURBOPACK_ISSUES = 'turbopack-error'
export const TYPE_BEFORE_REFRESH = 'before-fast-refresh'
export const TYPE_REFRESH = 'fast-refresh'
export const TYPE_UNHANDLED_ERROR = 'unhandled-error'
export const TYPE_UNHANDLED_REJECTION = 'unhandled-rejection'
export const TYPE_REACT_ERROR = 'react-error'

export type BuildOk = { type: typeof TYPE_BUILD_OK }
export type TurbopackIssues = {
  type: typeof TYPE_TURBOPACK_ISSUES
  issues: Issue[]
}
export type BeforeFastRefresh = { type: typeof TYPE_BEFORE_REFRESH }
export type FastRefresh = { type: typeof TYPE_REFRESH }
export type UnhandledError = {
  type: typeof TYPE_UNHANDLED_ERROR
  reason: Error
  frames: StackFrame[]
}
export type UnhandledRejection = {
  type: typeof TYPE_UNHANDLED_REJECTION
  reason: Error
  frames: StackFrame[]
}
export type ReactError = {
  type: typeof TYPE_REACT_ERROR
  error: Error
  componentStack: string | null
}

export type BusEvent =
  | BuildOk
  | TurbopackIssues
  | BeforeFastRefresh
  | FastRefresh
  | UnhandledError
  | UnhandledRejection
  | ReactError

export type BusEventHandler = (ev: BusEvent) => void

const handlers: Set<BusEventHandler> = new Set()
const queue: BusEvent[] = []

function drain() {
  // Draining should never happen synchronously in case multiple handlers are
  // registered.
  setTimeout(function () {
    while (
      // Until we are out of events:
      Boolean(queue.length) &&
      // Or, if all handlers removed themselves as a result of handling the
      // event(s)
      Boolean(handlers.size)
    ) {
      const ev = queue.shift()!
      handlers.forEach((handler) => handler(ev))
    }
  }, 1)
}

export function emit(ev: BusEvent): void {
  queue.push(Object.freeze({ ...ev }))
  drain()
}

export function on(fn: BusEventHandler): boolean {
  if (handlers.has(fn)) {
    return false
  }

  handlers.add(fn)
  drain()
  return true
}

export function off(fn: BusEventHandler): boolean {
  if (handlers.has(fn)) {
    handlers.delete(fn)
    return true
  }

  return false
}
