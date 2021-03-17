import { StackFrame } from 'stacktrace-parser'

export const TYPE_BUILD_OK = 'build-ok'
export const TYPE_BUILD_ERROR = 'build-error'
export const TYPE_REFFRESH = 'fast-refresh'
export const TYPE_UNHANDLED_ERROR = 'unhandled-error'
export const TYPE_UNHANDLED_REJECTION = 'unhandled-rejection'

export type BuildOk = { type: typeof TYPE_BUILD_OK }
export type BuildError = {
  type: typeof TYPE_BUILD_ERROR
  message: string
}
export type FastRefresh = { type: typeof TYPE_REFFRESH }
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
export type BusEvent =
  | BuildOk
  | BuildError
  | FastRefresh
  | UnhandledError
  | UnhandledRejection

export type BusEventHandler = (ev: BusEvent) => void

let handlers: Set<BusEventHandler> = new Set()
let queue: BusEvent[] = []

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
