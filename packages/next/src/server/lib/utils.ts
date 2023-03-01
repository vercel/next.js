import type arg from 'next/dist/compiled/arg/index.js'

export function printAndExit(message: string, code = 1) {
  if (code === 0) {
    console.log(message)
  } else {
    console.error(message)
  }

  process.exit(code)
}

export function getNodeOptionsWithoutInspect() {
  const NODE_INSPECT_RE = /--inspect(-brk)?(=\S+)?( |$)/
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
