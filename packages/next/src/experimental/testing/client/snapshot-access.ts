import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import type { ClientSnapshotMethod } from './protocol'

/** Reads selected source and its registered snapshots; writes remain parent-owned. */
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
  const testDirectory = dirname(selected)
  const rawPaths = new Set<string>()
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
  async function safeRawSnapshot(path: string) {
    // A new raw snapshot may have missing parent directories. Check its first
    // existing ancestor before the parent-owned transaction creates them.
    let directory = dirname(path)
    while (directory !== testDirectory) {
      try {
        if ((await realpath(directory)) !== directory)
          throw new Error(
            'Browser Mode raw snapshot directory cannot be a symbolic link.'
          )
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        directory = dirname(directory)
      }
    }
    try {
      if (!(await lstat(path)).isFile() || (await realpath(path)) !== path)
        throw new Error('Browser Mode raw snapshot must be a regular file.')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return {
    verifySource,
    ownsPath(path: string) {
      return path === selected || path === snapshot || rawPaths.has(path)
    },
    async verify() {
      await verifySource()
      await safeSnapshot()
      for (const path of rawPaths) await safeRawSnapshot(path)
    },
    async request(method: ClientSnapshotMethod, args: readonly string[]) {
      if (
        !Array.isArray(args) ||
        args.some((arg) => typeof arg !== 'string') ||
        args.length !== (method === 'resolveRawPath' ? 2 : 1)
      )
        throw new Error('Invalid Browser Mode snapshot request.')
      await verifySource()
      if (method === 'resolvePath' || method === 'resolveRawPath') {
        if (resolve(args[0]) !== selected)
          throw new Error(
            'Browser Mode snapshot owner does not match the selected source.'
          )
        if (method === 'resolveRawPath') {
          const path = resolve(testDirectory, args[1])
          const rel = relative(testDirectory, path)
          if (
            rel === '..' ||
            rel.startsWith(`..${sep}`) ||
            isAbsolute(rel) ||
            (path !== snapshot && rel.startsWith(`__snapshots__${sep}`))
          )
            throw new Error(
              'Browser Mode raw snapshot escaped its selected source directory.'
            )
          rawPaths.add(path)
          return path
        }
        await safeSnapshot()
        return snapshot
      }
      if (method !== 'readSnapshotFile')
        throw new Error('Unknown Browser Mode snapshot method.')
      const path = resolve(args[0])
      if (path !== selected && path !== snapshot && !rawPaths.has(path))
        throw new Error(
          'Browser Mode snapshot read escaped its selected source and managed snapshot.'
        )
      if (path === snapshot) await safeSnapshot()
      else if (rawPaths.has(path)) await safeRawSnapshot(path)
      try {
        return await readFile(path, 'utf8')
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code === 'ENOENT' &&
          path !== selected
        )
          return null
        throw error
      }
    },
  }
}
