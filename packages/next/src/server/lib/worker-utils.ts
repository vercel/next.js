import * as Log from '../../build/output/log'
import http from 'http'
import { getDebugPort } from './utils'

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

export const genRenderExecArgv = async (
  isNodeDebugging: string | boolean | undefined
) => {
  const execArgv = process.execArgv.filter((localArg) => {
    return (
      !localArg.startsWith('--inspect') && !localArg.startsWith('--inspect-brk')
    )
  })

  if (isNodeDebugging) {
    const isDebugging =
      process.execArgv.some((localArg) => localArg.startsWith('--inspect')) ||
      process.env.NODE_OPTIONS?.match?.(/--inspect(=\S+)?( |$)/)

    const isDebuggingWithBrk =
      process.execArgv.some((localArg) =>
        localArg.startsWith('--inspect-brk')
      ) || process.env.NODE_OPTIONS?.match?.(/--inspect-brk(=\S+)?( |$)/)

    if (isDebugging || isDebuggingWithBrk) {
      let debugPort = getDebugPort()

      debugPort += 1

      Log.info(
        `the --inspect${
          isDebuggingWithBrk ? '-brk' : ''
        } option was detected, the Next.js server should be inspected at port ${debugPort}.`
      )

      execArgv.push(`--inspect${isDebuggingWithBrk ? '-brk' : ''}=${debugPort}`)
    }
  }

  return execArgv
}
