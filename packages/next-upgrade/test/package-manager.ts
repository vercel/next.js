import type { SpawnSyncOptionsWithStringEncoding } from 'child_process'
import spawn from 'cross-spawn'

// Resolve Windows command shims while keeping fixture paths as separate arguments.
export function execPackageManager(
  command: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding
): string {
  const child = spawn.sync(command, args, options)
  if (child.error) {
    throw child.error
  }

  if (child.status !== 0) {
    throw new Error(
      `${command} failed with ${child.signal ?? child.status}: ${child.stderr}`
    )
  }

  return child.stdout
}
