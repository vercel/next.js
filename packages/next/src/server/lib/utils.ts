import type arg from 'next/dist/compiled/arg/index.js'

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
      ?.split('=', 2)[1] ??
    process.env.NODE_OPTIONS?.match?.(/--inspect(-brk)?(=(\S+))?( |$)/)?.[3]
  return debugPortStr ? parseInt(debugPortStr, 10) : 9229
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

export const RESTART_EXIT_CODE = 77

export function checkNodeDebugType() {
  let nodeDebugType = undefined

  if (
    process.execArgv.some((localArg) => localArg.startsWith('--inspect')) ||
    process.env.NODE_OPTIONS?.match?.(/--inspect(=\S+)?( |$)/)
  ) {
    nodeDebugType = 'inspect'
  }

  if (
    process.execArgv.some((localArg) => localArg.startsWith('--inspect-brk')) ||
    process.env.NODE_OPTIONS?.match?.(/--inspect-brk(=\S+)?( |$)/)
  ) {
    nodeDebugType = 'inspect-brk'
  }

  return nodeDebugType
}

export function getMaxOldSpaceSize() {
  const maxOldSpaceSize = process.env.NODE_OPTIONS?.match(
    /--max-old-space-size=(\d+)/
  )?.[1]

  return maxOldSpaceSize ? parseInt(maxOldSpaceSize, 10) : undefined
}
