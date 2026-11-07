import { consoleAsyncStorage } from '../app-render/console-async-storage.external'

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

// Based on https://github.com/facebook/react/blob/28dc0776be2e1370fe217549d32aee2519f0cf05/packages/react-server/src/ReactFlightServer.js#L248
function patchConsoleMethod(
  methodName: InterceptableConsoleMethod,
  getFileLogger: typeof import('../dev/browser-logs/file-logger').getFileLogger,
  formatConsoleArgs: typeof import('../../client/lib/console').formatConsoleArgs
): void {
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

        const fileLogger = getFileLogger()
        const message = formatConsoleArgs(args)
        // Strip ANSI escape codes for file logging
        // eslint-disable-next-line no-control-regex
        const ansiEscapeRegex = new RegExp('\u001b\\[[0-9;]*m', 'g')
        const cleanMessage = message.replace(ansiEscapeRegex, '')
        fileLogger.logServer(methodName.toUpperCase(), cleanMessage)
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
  // Only the development server writes logs to a file, so what that needs is
  // loaded here and not at the top of this file.
  const getFileLogger = (
    require('../dev/browser-logs/file-logger') as typeof import('../dev/browser-logs/file-logger')
  ).getFileLogger
  const formatConsoleArgs = (
    require('../../client/lib/console') as typeof import('../../client/lib/console')
  ).formatConsoleArgs
  const patchConsoleMethodDEV = (methodName: InterceptableConsoleMethod) =>
    patchConsoleMethod(methodName, getFileLogger, formatConsoleArgs)

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
