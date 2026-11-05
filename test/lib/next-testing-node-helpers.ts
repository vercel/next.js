import {
  execFile,
  execFileSync,
  type ExecFileOptionsWithStringEncoding,
  type ExecFileSyncOptionsWithStringEncoding,
} from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type NodeHelperOptions = Omit<ExecFileOptionsWithStringEncoding, 'encoding'> & {
  encoding?: 'utf8'
}
type NodeHelperSyncOptions = Omit<
  ExecFileSyncOptionsWithStringEncoding,
  'encoding'
> & { encoding?: 'utf8' }

type OutputDirectoryOptions = {
  cleanup: 'always' | 'success' | 'never'
  base?: string
}

export function runNodeHelper(
  argv: readonly string[],
  options: NodeHelperOptions = {}
) {
  return execFileAsync(process.execPath, [...argv], {
    ...options,
    encoding: 'utf8',
  })
}

export function runNodeHelperSync(
  argv: readonly string[],
  options: NodeHelperSyncOptions = {}
) {
  return execFileSync(process.execPath, [...argv], {
    ...options,
    encoding: 'utf8',
  })
}

export async function withOutputDirectory<T>(
  prefix: string,
  action: (output: string) => T | Promise<T>,
  { cleanup, base = tmpdir() }: OutputDirectoryOptions
): Promise<T> {
  const output = await mkdtemp(join(base, prefix))
  let complete = false
  try {
    const result = await action(output)
    complete = true
    return result
  } finally {
    if (cleanup === 'always' || (cleanup === 'success' && complete))
      await rm(output, { recursive: true, force: true })
  }
}

export function withOutputDirectorySync<T>(
  prefix: string,
  action: (output: string) => T,
  { cleanup, base = tmpdir() }: OutputDirectoryOptions
): T {
  const output = mkdtempSync(join(base, prefix))
  let complete = false
  try {
    const result = action(output)
    complete = true
    return result
  } finally {
    if (cleanup === 'always' || (cleanup === 'success' && complete))
      rmSync(output, { recursive: true, force: true })
  }
}
