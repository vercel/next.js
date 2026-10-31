export type LogMethod =
  | 'log'
  | 'info'
  | 'debug'
  | 'table'
  | 'error'
  | 'assert'
  | 'dir'
  | 'dirxml'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd'
  | 'trace'
  | 'warn'

export type ConsoleEntry<T> = {
  kind: 'console'
  method: LogMethod
  consoleMethodStack: string | null
  args: Array<
    | {
        kind: 'arg'
        data: T
      }
    | {
        kind: 'formatted-error-arg'
        prefix: string
        stack: string
      }
  >
}

export type ConsoleErrorEntry<T> = {
  kind: 'any-logged-error'
  method: 'error'
  consoleErrorStack: string
  args: Array<
    | {
        kind: 'arg'
        data: T
        isRejectionMessage?: boolean
      }
    | {
        kind: 'formatted-error-arg'
        prefix: string
        stack: string | null
      }
  >
}

export type FormattedErrorEntry = {
  kind: 'formatted-error'
  prefix: string
  stack: string
  method: 'error'
}

export type ClientLogEntry =
  | ConsoleEntry<unknown>
  | ConsoleErrorEntry<unknown>
  | FormattedErrorEntry
export type ServerLogEntry =
  | ConsoleEntry<string>
  | ConsoleErrorEntry<string>
  | FormattedErrorEntry

export const UNDEFINED_MARKER = '__next_tagged_undefined'

const alreadyLoggedOnServerSymbol = Symbol('nextAlreadyLoggedOnServer')

/**
 * Marks an error that originated on the server and was already logged there.
 * Such errors are also sent to the browser, where they get logged to the
 * browser console and shown in the dev overlay. This marker lets the
 * browser-to-terminal log forwarding skip them, so they aren't replayed back to
 * the CLI as duplicates.
 */
export function markErrorAsAlreadyLoggedOnServer(error: object): void {
  Object.defineProperty(error, alreadyLoggedOnServerSymbol, {
    value: true,
    enumerable: false,
    configurable: true,
  })
}

export function wasErrorAlreadyLoggedOnServer(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[alreadyLoggedOnServerSymbol] === true
  )
}

// Based on https://github.com/facebook/react/blob/28dc0776be2e1370fe217549d32aee2519f0cf05/packages/react-server/src/ReactFlightServer.js#L248
export function patchConsoleMethod<T extends keyof Console>(
  methodName: T,
  wrapper: (
    methodName: T,
    ...args: Console[T] extends (...args: infer P) => any ? P : never[]
  ) => void
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(console, methodName)
  if (
    descriptor &&
    (descriptor.configurable || descriptor.writable) &&
    typeof descriptor.value === 'function'
  ) {
    const originalMethod = descriptor.value as Console[T] extends (
      ...args: any[]
    ) => any
      ? Console[T]
      : never
    const originalName = Object.getOwnPropertyDescriptor(originalMethod, 'name')
    const wrapperMethod = function (
      this: typeof console,
      ...args: Console[T] extends (...args: infer P) => any ? P : never[]
    ) {
      wrapper(methodName, ...args)

      originalMethod.apply(this, args)
    }
    if (originalName) {
      Object.defineProperty(wrapperMethod, 'name', originalName)
    }
    Object.defineProperty(console, methodName, {
      value: wrapperMethod,
    })

    return () => {
      Object.defineProperty(console, methodName, {
        value: originalMethod,
        writable: descriptor.writable,
        configurable: descriptor.configurable,
      })
    }
  }

  return () => {}
}
