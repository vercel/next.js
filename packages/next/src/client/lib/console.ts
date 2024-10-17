// function formatTemplate(fmt: string, args: any[]): string {
//   // global regex has state, define a new one each run
//   const TEMPLATE_REGEX = /(%?)(%([ojdsci]))/g
//   let replaced = ''
//   if (args.length) {
//     replaced = fmt.replace(
//       TEMPLATE_REGEX,
//       function (match, escaped, _pattern, flag) {
//         let arg = args.shift()
//         // Checkout console string docs for flag type
//         // x-ref: https://developer.mozilla.org/en-US/docs/Web/API/console#using_string_substitutions
//         switch (flag) {
//           case 'o': {
//             if (Array.isArray(arg)) {
//               arg = JSON.stringify(arg)
//             }
//             break
//           }
//           case 's':
//             arg = '' + arg
//             break
//           case 'i':
//           case 'd':
//             arg = Number(arg)
//             break
//           case 'j':
//             arg = JSON.stringify(arg)
//             break
//           case 'c':
//             // template is a CSS, skip
//             break
//           default:
//             break
//         }
//         if (!escaped) {
//           return arg
//         }
//         args.unshift(arg)
//         return match
//       }
//     )
//   } else {
//     replaced = fmt + ''
//   }

//   // arguments remain after formatting
//   if (args.length) {
//     replaced += ' ' + args.join(' ')
//   }

//   // update escaped %% values
//   replaced = replaced.replace(/%{2,2}/g, '%')

//   return replaced
// }

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
