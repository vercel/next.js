/**
 * Do not haphazardly change the name of this file, users that do not have ignore
 * listing configured will see the name of this source file in chrome devtools console
 */
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

      /*
       * Your console call is being intercepted by Next.js, which makes your dev tools show the wrong source location.
       *
       * To see the true source location of the console method call, you can do one of the following:
       * - open your browser's DevTools before the log happens (ensure you have ignore listing on https://developer.chrome.com/docs/devtools/settings/ignore-list)
       * - set browserDebugInfoInTerminal to false in your next.config file.
       */
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
