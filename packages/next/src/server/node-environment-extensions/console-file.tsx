import { consoleAsyncStorage } from '../app-render/console-async-storage.external'
import { getLogStream, methodToLevel } from '../dev/log-stream'
import { formatConsoleArgs } from '../../client/lib/console'

type InterceptableConsoleMethod =
  | 'error'
  | 'assert'
  | 'debug'
  | 'dir'
  | 'dirxml'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd'
  | 'info'
  | 'log'
  | 'table'
  | 'trace'
  | 'warn'

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;]*m/g

// Based on https://github.com/facebook/react/blob/28dc0776be2e1370fe217549d32aee2519f0cf05/packages/react-server/src/ReactFlightServer.js#L248
function patchConsoleMethodDEV(methodName: InterceptableConsoleMethod): void {
  const descriptor = Object.getOwnPropertyDescriptor(console, methodName)
  if (
    descriptor &&
    (descriptor.configurable || descriptor.writable) &&
    typeof descriptor.value === 'function'
  ) {
    const originalMethod = descriptor.value
    const originalName = Object.getOwnPropertyDescriptor(originalMethod, 'name')
    const wrapperMethod = function (this: typeof console, ...args: any[]) {
      const consoleStore = consoleAsyncStorage.getStore()

      if (consoleStore?.dim === true) {
        // In this context the log args are already dimmed. We use the console store
        // to decide if this log is ignorable for reporting in our file logger.
        return originalMethod.apply(this, args)
      } else {
        const ret = originalMethod.apply(this, args)

        const message = formatConsoleArgs(args)
        // Strip ANSI escape codes for file logging
        const cleanMessage = message.replace(ANSI_ESCAPE_REGEX, '')
        getLogStream().emit(methodToLevel(methodName), cleanMessage, {
          source: 'userland',
          scope: 'console',
          structured: { method: methodName.toUpperCase() },
        })
        return ret
      }
    }
    if (originalName) {
      Object.defineProperty(wrapperMethod, 'name', originalName)
    }
    Object.defineProperty(console, methodName, {
      value: wrapperMethod,
    })
  }
}

if (process.env.NODE_ENV === 'development') {
  patchConsoleMethodDEV('error')
  patchConsoleMethodDEV('assert')
  patchConsoleMethodDEV('debug')
  patchConsoleMethodDEV('dir')
  patchConsoleMethodDEV('dirxml')
  patchConsoleMethodDEV('group')
  patchConsoleMethodDEV('groupCollapsed')
  patchConsoleMethodDEV('groupEnd')
  patchConsoleMethodDEV('info')
  patchConsoleMethodDEV('log')
  patchConsoleMethodDEV('table')
  patchConsoleMethodDEV('trace')
  patchConsoleMethodDEV('warn')
}
