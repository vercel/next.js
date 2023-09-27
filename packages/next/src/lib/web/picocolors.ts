// In the web runtime, we create an alternative object that just outputs the
// message to the console without any styling. The same APIs are supported
// for compatibility:
// - picocolors.red('error')
// - picocolors.bold.cyan('message')
// - picocolors.hex('#fff').underline('hello')
const picocolors: any = new Proxy((s: string) => s, {
  get(_, prop: string) {
    if (
      ['hex', 'rgb', 'ansi256', 'bgHex', 'bgRgb', 'bgAnsi256'].includes(prop)
    ) {
      return () => picocolors
    }
    return picocolors
  },
})

export default picocolors
