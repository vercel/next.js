import isError from '../../lib/is-error'

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
      } else if (arg instanceof Error) {
        return arg + ''
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
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'symbol':
    case 'undefined':
    case 'function':
    default:
      return String(arg)
  }
}

export function formatConsoleArgs(args: unknown[]): string {
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
  let startQuote = false
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
        result = startQuote ? `${result}]` : `[${result}`
        startQuote = !startQuote
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

export function parseConsoleArgs(args: unknown[]): {
  environmentName: string | null
  error: Error | null
} {
  // See
  // https://github.com/facebook/react/blob/65a56d0e99261481c721334a3ec4561d173594cd/packages/react-devtools-shared/src/backend/flight/renderer.js#L88-L93
  //
  // Logs replayed from the server look like this:
  // [
  //   "%c%s%c%o\n\n%s\n\n%s\n",
  //   "background: #e6e6e6; ...",
  //   " Server ", // can also be e.g. " Prerender "
  //   "",
  //   Error,
  //   "The above error occurred in the <Page> component.",
  //   ...
  // ]
  if (
    args.length > 3 &&
    typeof args[0] === 'string' &&
    args[0].startsWith('%c%s%c') &&
    typeof args[1] === 'string' &&
    typeof args[2] === 'string' &&
    typeof args[3] === 'string'
  ) {
    const environmentName = args[2]
    const maybeError = args[4]

    return {
      environmentName: environmentName.trim(),
      error: isError(maybeError) ? maybeError : null,
    }
  }

  return {
    environmentName: null,
    error: null,
  }
}
