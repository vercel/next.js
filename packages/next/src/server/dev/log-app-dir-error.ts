import isError from '../../lib/is-error'
import * as Log from '../../build/output/log'

export function logAppDirError(err: any) {
  if (isError(err) && err?.stack) {
    const filteredStack = err.stack
      .split('\n')
      .map((line: string) =>
        // Remove 'webpack-internal:' noise from the path
        line.replace(/(webpack-internal:\/\/\/|file:\/\/)(\(.*\)\/)?/, '')
      )
      // Only display stack frames from the user's code
      .filter(
        (line: string) =>
          !/next[\\/]dist[\\/]compiled/.test(line) &&
          !/node_modules[\\/]/.test(line) &&
          !/node:internal[\\/]/.test(line)
      )
      .join('\n')
    Log.error(filteredStack)
    if (typeof (err as any).digest !== 'undefined') {
      console.error(`digest: ${JSON.stringify((err as any).digest)}`)
    }
  } else {
    Log.error(err)
  }
}
