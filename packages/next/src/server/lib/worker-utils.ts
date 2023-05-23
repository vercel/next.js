import * as Log from '../../build/output/log'
import http from 'http'

export const getFreePort = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = http.createServer(() => {})
    server.listen(0, () => {
      const address = server.address()
      server.close()

      if (address && typeof address === 'object') {
        resolve(address.port)
      } else {
        reject(new Error('invalid address from server: ' + address?.toString()))
      }
    })
  })
}

export const genRenderExecArgv = (type: 'pages' | 'app') => {
  const isDebugging =
    process.execArgv.some((localArg) => localArg.startsWith('--inspect')) ||
    process.env.NODE_OPTIONS?.match?.(/--inspect(=\S+)?( |$)/)

  const isDebuggingWithBrk =
    process.execArgv.some((localArg) => localArg.startsWith('--inspect-brk')) ||
    process.env.NODE_OPTIONS?.match?.(/--inspect-brk(=\S+)?( |$)/)

  let debugPort = (() => {
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

  debugPort += type === 'pages' ? 2 : 3

  if (isDebugging || isDebuggingWithBrk) {
    Log.info(
      `the --inspect${
        isDebuggingWithBrk ? '-brk' : ''
      } option was detected, the Next.js server${
        type === 'pages' ? ' for pages' : type === 'app' ? ' for app' : ''
      } should be inspected at port ${debugPort}.`
    )
  }
  const execArgv = process.execArgv.filter((localArg) => {
    return (
      !localArg.startsWith('--inspect') && !localArg.startsWith('--inspect-brk')
    )
  })

  if (isDebugging || isDebuggingWithBrk) {
    execArgv.push(`--inspect${isDebuggingWithBrk ? '-brk' : ''}=${debugPort}`)
  }

  return execArgv
}
