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

interface GetPortOptions {
  dir?: string
}

export function getPort(
  args: arg.Result<arg.Spec>,
  options: GetPortOptions = {}
): number {
  if (typeof args['--port'] === 'number') {
    return args['--port']
  }

  if (args['--readDotEnv']) {
    const { dir } = options
    const isDev = process.env.NODE_ENV === 'development'
    const isTest = process.env.NODE_ENV === 'test'
    const mode = isTest ? 'test' : isDev ? 'development' : 'production'
    const { getDotEnvFilenames, loadEnvConfig } =
      require('@next/env') as typeof import('@next/env')
    const findUp =
      require('next/dist/compiled/find-up') as typeof import('next/dist/compiled/find-up')
    const dotenvFiles = getDotEnvFilenames(mode)
    const envPath = findUp.sync(dotenvFiles, { cwd: dir })
    if (envPath) {
      const { dirname } = require('path') as typeof import('path')
      loadEnvConfig(dirname(envPath), isDev)
    }
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
