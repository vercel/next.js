// In the web runtime, we create an alternative object that just outputs the
// message to the console without any styling. The same APIs are supported
// for compatibility:
// - chalk.red('error')
// - chalk.bold.cyan('message')
// - chalk.hex('#fff').underline('hello')
const chalk: any = new Proxy((s: string) => s, {
  get(_, prop: string) {
    if (
      ['hex', 'rgb', 'ansi256', 'bgHex', 'bgRgb', 'bgAnsi256'].includes(prop)
    ) {
      return () => chalk
    }
    return chalk
  },
})

export default chalk
