// In the web runtime, we create an alternative object that just outputs the
// message to the console without any styling. The same APIs are supported
// for compatibility:
// - chalk.red('error')
// - chalk.bold.cyan('message')
// - chalk.hex('#fff').underline('hello')
const log = console.log
const chalk = new Proxy(log, {
  get(_, prop: string) {
    if (
      ['hex', 'rgb', 'ansi256', 'bgHex', 'bgRgb', 'bgAnsi256'].includes(prop)
    ) {
      return () => chalk
    }
    return chalk
  },
}) as typeof import('next/dist/compiled/chalk')

export default chalk
