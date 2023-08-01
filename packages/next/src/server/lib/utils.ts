import type arg from 'next/dist/compiled/arg/index.js'
import * as Log from '../../build/output/log'

export function printAndExit(message: string, code = 1) {
  if (code === 0) {
    console.log(message)
  } else {
    console.error(message)
  }

  process.exit(code)
}

export const getDebugPort = () => {
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
}

export const genRouterWorkerExecArgv = async (
  isNodeDebugging: boolean | 'brk'
) => {
  const execArgv = process.execArgv.filter((localArg) => {
    return (
      !localArg.startsWith('--inspect') && !localArg.startsWith('--inspect-brk')
    )
  })

  if (isNodeDebugging) {
    const isDebuggingWithBrk = isNodeDebugging === 'brk'

    let debugPort = getDebugPort() + 1

    Log.info(
      `the --inspect${
        isDebuggingWithBrk ? '-brk' : ''
      } option was detected, the Next.js routing server should be inspected at port ${debugPort}.`
    )

    execArgv.push(
      `--inspect${isNodeDebugging === 'brk' ? '-brk' : ''}=${debugPort}`
    )
  }

  return execArgv
}

const NODE_INSPECT_RE = /--inspect(-brk)?(=\S+)?( |$)/
export function getNodeOptionsWithoutInspect() {
  return (process.env.NODE_OPTIONS || '').replace(NODE_INSPECT_RE, '')
}

export function getPort(args: arg.Result<arg.Spec>): number {
  if (typeof args['--port'] === 'number') {
    return args['--port']
  }

  const parsed = process.env.PORT && parseInt(process.env.PORT, 10)
  if (typeof parsed === 'number' && !Number.isNaN(parsed)) {
    return parsed
  }

  return 3000
}
