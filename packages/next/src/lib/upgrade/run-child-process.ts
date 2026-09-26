import type { SpawnOptions } from 'child_process'
import { constants as osConstants } from 'os'

import spawn from 'next/dist/compiled/cross-spawn'

export function runChildProcess(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<number> {
  const child = spawn(command, args, options)

  return new Promise((resolve, reject) => {
    const onInterrupt = () => child.kill('SIGINT')
    const onTerminate = () => child.kill('SIGTERM')
    const onHangup = () => child.kill('SIGHUP')
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    process.on('SIGHUP', onHangup)

    const cleanup = () => {
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
      process.removeListener('SIGHUP', onHangup)
    }

    child.once('error', (error: Error) => {
      cleanup()
      reject(error)
    })
    child.once(
      'close',
      (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup()
        resolve(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 1) : 1))
      }
    )
  })
}
