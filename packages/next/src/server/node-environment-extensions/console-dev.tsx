import { dim } from '../../lib/picocolors'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'

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

// This function could be used from multiple places, including hook.
// Skips CSS and object arguments, inlines other in the first argument as a template string
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @source https://github.com/facebook/react/blob/b44a99bf58d69d52b5288d9eadcc6d226d705e11/packages/react-devtools-shared/src/backend/utils/formatConsoleArguments.js#L14
 */
function formatConsoleArguments(maybeMessage: any, ...inputArgs: any[]): any[] {
  if (inputArgs.length === 0 || typeof maybeMessage !== 'string') {
    return [maybeMessage, ...inputArgs]
  }

  const args = inputArgs.slice()

  let template = ''
  let argumentsPointer = 0
  for (let i = 0; i < maybeMessage.length; ++i) {
    const currentChar = maybeMessage[i]
    if (currentChar !== '%') {
      template += currentChar
      continue
    }

    const nextChar = maybeMessage[i + 1]
    ++i

    // Only keep CSS and objects, inline other arguments
    switch (nextChar) {
      case 'c':
      case 'O':
      case 'o': {
        ++argumentsPointer
        template += `%${nextChar}`

        break
      }
      case 'd':
      case 'i': {
        const [arg] = args.splice(argumentsPointer, 1)
        template += parseInt(arg, 10).toString()

        break
      }
      case 'f': {
        const [arg] = args.splice(argumentsPointer, 1)
        template += parseFloat(arg).toString()

        break
      }
      case 's': {
        const [arg] = args.splice(argumentsPointer, 1)
        template += String(arg)

        break
      }

      default:
        template += `%${nextChar}`
    }
  }

  return [template, ...args]
}

const isColorSupported = dim('test') !== 'test'
// TODO: Breaks when complex objects are logged
// dim("%s") does not work in Chrome
const ANSI_STYLE_DIMMING_TEMPLATE = isColorSupported
  ? '\x1b[2;38;2;124;124;124m%s\x1b[0m'
  : '%s'

function dimConsoleCall(
  methodName: InterceptableConsoleMethod,
  args: any[]
): any[] {
  switch (methodName) {
    case 'dir':
    case 'dirxml':
    case 'group':
    case 'groupCollapsed':
    case 'groupEnd':
    case 'table': {
      // These methods cannot be colorized because they don't take a formatting string.
      return args
    }
    case 'assert': {
      // assert takes formatting options as the second argument.
      return [args[0]].concat(
        ANSI_STYLE_DIMMING_TEMPLATE,
        ...formatConsoleArguments(args[1], ...args.slice(2))
      )
    }
    case 'error':
    case 'debug':
    case 'info':
    case 'log':
    case 'trace':
    case 'warn':
      return [ANSI_STYLE_DIMMING_TEMPLATE].concat(
        ...formatConsoleArguments(args[0], ...args.slice(1))
      )
    default:
      return methodName satisfies never
  }
}

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
      const workUnitStore = workUnitAsyncStorage.getStore()

      switch (workUnitStore?.type) {
        case 'prerender':
        case 'prerender-client':
          originalMethod.apply(this, dimConsoleCall(methodName, args))
          break
        case 'prerender-ppr':
        case 'prerender-legacy':
        case 'request':
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case undefined:
          originalMethod.apply(this, args)
          break
        default:
          workUnitStore satisfies never
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
