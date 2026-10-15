import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { ClientSnapshotMethod } from './protocol'

/** Reads selected source and its managed snapshot only; writes remain parent-owned. */
export async function createClientSnapshotAccess(
  file: string,
  sourceHash: string
) {
  const selected = await realpath(file)
  const snapshot = join(
    dirname(selected),
    '__snapshots__',
    `${basename(selected)}.snap`
  )
  const expectedDir = dirname(snapshot)
  async function verifySource() {
    if (
      (await realpath(file)) !== selected ||
      !(await lstat(file)).isFile() ||
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex') !== sourceHash
    )
      throw new Error(
        'Browser Mode selected source changed or escaped after compilation.'
      )
  }
  await verifySource()
  async function safeSnapshot() {
    let canonicalDir: string
    try {
      canonicalDir = await realpath(expectedDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    if (canonicalDir !== expectedDir)
      throw new Error(
        'Browser Mode snapshot directory cannot be a symbolic link.'
      )
    try {
      if (
        !(await lstat(snapshot)).isFile() ||
        (await realpath(snapshot)) !== snapshot
      )
        throw new Error('Browser Mode snapshot must be a regular managed file.')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return {
    verifySource,
    async verify() {
      await verifySource()
      await safeSnapshot()
    },
    async request(method: ClientSnapshotMethod, args: readonly string[]) {
      if (
        !Array.isArray(args) ||
        args.some((arg) => typeof arg !== 'string') ||
        args.length !== (method === 'resolveRawPath' ? 2 : 1)
      )
        throw new Error('Invalid Browser Mode snapshot request.')
      await verifySource()
      if (method === 'resolveRawPath')
        throw new Error('Browser Mode raw file snapshots remain unsupported.')
      if (method === 'resolvePath') {
        if (resolve(args[0]) !== selected)
          throw new Error(
            'Browser Mode snapshot owner does not match the selected source.'
          )
        await safeSnapshot()
        return snapshot
      }
      if (method !== 'readSnapshotFile')
        throw new Error('Unknown Browser Mode snapshot method.')
      const path = resolve(args[0])
      if (path !== selected && path !== snapshot)
        throw new Error(
          'Browser Mode snapshot read escaped its selected source and managed snapshot.'
        )
      if (path === snapshot) await safeSnapshot()
      try {
        return await readFile(path, 'utf8')
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code === 'ENOENT' &&
          path === snapshot
        )
          return null
        throw error
      }
    },
  }
}
