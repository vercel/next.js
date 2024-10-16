import { isNextRouterError } from '../is-next-router-error'
import { handleClientError } from '../react-dev-overlay/internal/helpers/use-error-handler'

function formatObject(arg: unknown, depth: number) {
  switch (typeof arg) {
    case 'object':
      if (arg === null) {
        return 'null'
      } else if (Array.isArray(arg)) {
        let result = '['
        if (depth < 1) {
          for (let i = 0; i < arg.length; i++) {
            if (result !== '[') {
              result += ','
            }
            if (Object.prototype.hasOwnProperty.call(arg, i)) {
              result += formatObject(arg[i], depth + 1)
            }
          }
        } else {
          result += arg.length > 0 ? '...' : ''
        }
        result += ']'
        return result
      } else {
        const keys = Object.keys(arg)
        let result = '{'
        if (depth < 1) {
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            const desc = Object.getOwnPropertyDescriptor(arg, 'key')
            if (desc && !desc.get && !desc.set) {
              const jsonKey = JSON.stringify(key)
              if (jsonKey !== '"' + key + '"') {
                result += jsonKey + ': '
              } else {
                result += key + ': '
              }
              result += formatObject(desc.value, depth + 1)
            }
          }
        } else {
          result += keys.length > 0 ? '...' : ''
        }
        result += '}'
        return result
      }
    case 'string':
      return JSON.stringify(arg)
    default:
      return String(arg)
  }
}

function formatConsoleMessage(args: unknown[]): string {
  let message: string
  let idx: number
  if (typeof args[0] === 'string') {
    message = args[0]
    idx = 1
  } else {
    message = ''
    idx = 0
  }
  let result = ''
  for (let i = 0; i < message.length; ++i) {
    const char = message[i]
    if (char !== '%' || i === message.length - 1 || idx >= args.length) {
      result += char
      continue
    }

    const code = message[++i]
    switch (code) {
      case 'c': {
        // TODO: We should colorize with HTML instead of turning into a string.
        // Ignore for now.
        idx++
        break
      }
      case 'O':
      case 'o': {
        result += formatObject(args[idx++], 0)
        break
      }
      case 'd':
      case 'i': {
        result += parseInt(args[idx++] as any, 10)
        break
      }
      case 'f': {
        result += parseFloat(args[idx++] as any)
        break
      }
      case 's': {
        result += String(args[idx++])
        break
      }
      default:
        result += '%' + code
    }
  }

  for (; idx < args.length; idx++) {
    result += (idx > 0 ? ' ' : '') + formatObject(args[idx], 0)
  }

  return result
}

// Patch console.error to collect information about hydration errors
export function patchConsoleError() {
  // Ensure it's only patched once
  if (typeof window === 'undefined') {
    return
  }

  const originConsoleError = window.console.error
  window.console.error = (...args) => {
    let error
    if (
      process.env.NODE_ENV !== 'production' &&
      args[0] === '%o\n\n%s\n%s\n\n%s' &&
      args[1] instanceof Error
    ) {
      // This looks like React printing an error object. We'll just take the error object.
      // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
      error = args[1]
    } else if (args.length === 1 && args[0] instanceof Error) {
      error = args[0]
    } else if (process.env.NODE_ENV !== 'production') {
      // Format the console arguments as an error object.
      // Keep the stack as the stack of the console.error call.
      error = new Error(formatConsoleMessage(args))
    }

    if (!isNextRouterError(error)) {
      if (process.env.NODE_ENV !== 'production') {
        const { storeHydrationErrorStateFromConsoleArgs } =
          require('../react-dev-overlay/internal/helpers/hydration-error-info') as typeof import('../react-dev-overlay/internal/helpers/hydration-error-info')

        storeHydrationErrorStateFromConsoleArgs(...args)
        handleClientError(error)
      }

      originConsoleError.apply(window.console, args)
    }
  }
}
