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

const isColorSupported = dim('test') !== 'test'

// 50% opacity for dimmed text
const dimStyle = 'color: color(from currentColor xyz x y z / 0.5);'
const reactBadgeFormat = '\x1b[0m\x1b[7m%c%s\x1b[0m%c '

function dimmedConsoleArgs(...inputArgs: any[]): any[] {
  if (!isColorSupported) {
    return inputArgs
  }

  const newArgs = inputArgs.slice(0)
  let template = ''
  let argumentsPointer = 0
  if (typeof inputArgs[0] === 'string') {
    const originalTemplateString = inputArgs[0]
    // Remove the original template string from the args.
    newArgs.splice(argumentsPointer, 1)
    argumentsPointer += 1

    let i = 0
    if (originalTemplateString.startsWith(reactBadgeFormat)) {
      i = reactBadgeFormat.length
      // for `format` we already moved the pointer earlier
      // style, badge, reset style
      argumentsPointer += 3
      template += reactBadgeFormat
      // React's badge reset styles, reapply dimming
      template += '\x1b[2m%c'
      // argumentsPointer includes template
      newArgs.splice(argumentsPointer - 1, 0, dimStyle)
      // dim the badge
      newArgs[0] += `;${dimStyle}`
    }

    for (i; i < originalTemplateString.length; i++) {
      const currentChar = originalTemplateString[i]
      if (currentChar !== '%') {
        template += currentChar
        continue
      }

      const nextChar = originalTemplateString[i + 1]
      ++i

      switch (nextChar) {
        case 'f':
        case 'O':
        case 'o':
        case 'd':
        case 's':
        case 'i':
        case 'c':
          ++argumentsPointer
          template += `%${nextChar}`
          break
        default:
          template += `%${nextChar}`
      }
    }
  }

  for (
    argumentsPointer;
    argumentsPointer < inputArgs.length;
    ++argumentsPointer
  ) {
    const arg = inputArgs[argumentsPointer]
    const argType = typeof arg
    if (argumentsPointer > 0) {
      template += ' '
    }
    switch (argType) {
      case 'boolean':
      case 'string':
        template += '%s'
        break
      case 'bigint':
        template += '%s'
        break
      case 'number':
        if (arg % 0) {
          template += '%f'
        } else {
          template += '%d'
        }
        break
      case 'object':
        template += '%O'
        break
      case 'symbol':
      case 'undefined':
      case 'function':
        template += '%s'
        break
      default:
        // deopt to string for new, unknown types
        template += '%s'
    }
  }

  template += '\x1b[22m'

  return [dim(`%c${template}`), dimStyle, ...newArgs]
}

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
      return [args[0]].concat(...dimmedConsoleArgs(args[1], ...args.slice(2)))
    }
    case 'error':
    case 'debug':
    case 'info':
    case 'log':
    case 'trace':
    case 'warn':
      return dimmedConsoleArgs(args[0], ...args.slice(1))
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
        case 'prerender-runtime':
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
