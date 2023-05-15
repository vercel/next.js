import * as Log from '../../build/output/log'

export const genRenderExecArgv = () => {
  const isDebugging =
    process.execArgv.some((localArg) => localArg.startsWith('--inspect')) ||
    process.env.NODE_OPTIONS?.match?.(/--inspect(=\S+)?( |$)/)

  const isDebuggingWithBrk =
    process.execArgv.some((localArg) => localArg.startsWith('--inspect-brk')) ||
    process.env.NODE_OPTIONS?.match?.(/--inspect-brk(=\S+)?( |$)/)

  const debugPort = (() => {
    const debugPortStr =
      process.execArgv
        .find(
          (localArg) =>
            localArg.startsWith('--inspect') ||
            localArg.startsWith('--inspect-brk')
        )
        ?.split('=')[1] ??
      process.env.NODE_OPTIONS?.match?.(/--inspect(-brk)?(=(\S+))?( |$)/)?.[3]
    return debugPortStr ? parseInt(debugPortStr, 10) : 9229
  })()

  if (isDebugging || isDebuggingWithBrk) {
    Log.warn(
      `the --inspect${
        isDebuggingWithBrk ? '-brk' : ''
      } option was detected, the Next.js server should be inspected at port ${
        debugPort + 1
      }.`
    )
  }
  const execArgv = process.execArgv.filter((localArg) => {
    return (
      !localArg.startsWith('--inspect') && !localArg.startsWith('--inspect-brk')
    )
  })

  if (isDebugging || isDebuggingWithBrk) {
    execArgv.push(
      `--inspect${isDebuggingWithBrk ? '-brk' : ''}=${debugPort + 1}`
    )
  }

  return execArgv
}
