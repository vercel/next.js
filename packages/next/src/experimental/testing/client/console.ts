import { format } from '../../../compiled/next-test-primitives/browser'
import { clientConsoleBoundary } from './protocol'

const streams = {
  log: 'stdout',
  info: 'stdout',
  debug: 'stdout',
  warn: 'stderr',
  error: 'stderr',
} as const

/** Format values while they are still in their actual browser realm. */
export function installClientConsole(
  target: Pick<Console, keyof typeof streams>,
  onOutput: (stream: 'stdout' | 'stderr', text: string) => void
) {
  const methods = Object.keys(streams) as (keyof typeof streams)[]
  const originals = Object.fromEntries(
    methods.map((method) => [method, target[method]])
  ) as Pick<Console, keyof typeof streams>
  let active = true
  function restore() {
    if (!active) return
    active = false
    const errors: unknown[] = []
    for (const method of methods) {
      try {
        target[method] = originals[method]
      } catch (error) {
        errors.push(error)
      }
    }
    try {
      originals.debug.call(target, clientConsoleBoundary.stop)
    } catch (error) {
      errors.push(error)
    }
    if (errors.length)
      throw new AggregateError(errors, 'Browser console restoration failed.')
  }
  function wrap(method: keyof typeof streams) {
    return (...args: unknown[]) => {
      if (
        active &&
        method === 'debug' &&
        args.length === 1 &&
        Object.values(clientConsoleBoundary).includes(args[0] as any)
      )
        originals.debug.call(target, clientConsoleBoundary.escape)
      originals[method].apply(target, args)
      if (active)
        onOutput(streams[method], `${format(args, { multiline: true })}\n`)
    }
  }
  try {
    for (const method of methods) target[method] = wrap(method)
    originals.debug.call(target, clientConsoleBoundary.start)
  } catch (error) {
    try {
      restore()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Browser console installation and restoration failed.'
      )
    }
    throw error
  }
  return restore
}
