function formatTemplate(fmt: string, args: any[]): string {
  // global regex has state, define a new one each run
  const TEMPLATE_REGEX = /(%?)(%([ojdsci]))/g
  let replaced = ''
  if (args.length) {
    replaced = fmt.replace(
      TEMPLATE_REGEX,
      function (match, escaped, _pattern, flag) {
        let arg = args.shift()
        // Checkout console string docs for flag type
        // x-ref: https://developer.mozilla.org/en-US/docs/Web/API/console#using_string_substitutions
        switch (flag) {
          case 'o': {
            if (Array.isArray(arg)) {
              arg = JSON.stringify(arg)
            }
            break
          }
          case 's':
            arg = '' + arg
            break
          case 'i':
          case 'd':
            arg = Number(arg)
            break
          case 'j':
            arg = JSON.stringify(arg)
            break
          case 'c':
            // template is a CSS, skip
            break
          default:
            break
        }
        if (!escaped) {
          return arg
        }
        args.unshift(arg)
        return match
      }
    )
  } else {
    replaced = fmt + ''
  }

  // arguments remain after formatting
  if (args.length) {
    replaced += ' ' + args.join(' ')
  }

  // update escaped %% values
  replaced = replaced.replace(/%{2,2}/g, '%')

  return replaced
}

export function formatConsoleArgs(args: any[]): string {
  return formatTemplate(args[0], args.slice(1))
}
