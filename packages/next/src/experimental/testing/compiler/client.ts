import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

export function assertClientPath(file: unknown): asserts file is string {
  if (
    typeof file !== 'string' ||
    !file ||
    isAbsolute(file) ||
    file.includes('\\') ||
    file.includes('\0') ||
    file.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Invalid compiler-issued Browser Mode asset path.')
}
export async function readClientDescriptor(
  root: string,
  entryPath: string,
  files: readonly string[],
  id: string
) {
  if (
    entryPath !== `server/next-test/${id}.client.json` ||
    !files.includes(entryPath)
  )
    throw new Error('Missing native Browser Mode client descriptor.')
  const descriptor: unknown = JSON.parse(
    await readFile(join(root, entryPath), 'utf8')
  )
  if (
    !descriptor ||
    typeof descriptor !== 'object' ||
    Array.isArray(descriptor)
  )
    throw new Error('Invalid native Browser Mode descriptor.')
  const { version, scripts, styles, ...unknown } = descriptor as Record<
    string,
    unknown
  >
  if (
    version !== 1 ||
    Object.keys(unknown).length ||
    !Array.isArray(scripts) ||
    !scripts.length ||
    !Array.isArray(styles)
  )
    throw new Error('Invalid native Browser Mode descriptor.')
  const selected = [...scripts, ...styles]
  if (new Set(selected).size !== selected.length)
    throw new Error('Duplicate native Browser Mode bootstrap assets.')
  for (const file of selected) {
    assertClientPath(file)
    if (!files.includes(file))
      throw new Error(
        'Browser Mode bootstrap is outside the immutable output closure.'
      )
  }
  if (
    scripts.some((file) => !file.endsWith('.js')) ||
    styles.some((file) => !file.endsWith('.css'))
  )
    throw new Error('Invalid native Browser Mode bootstrap asset type.')
  return {
    version: 1 as const,
    scripts: scripts as string[],
    styles: styles as string[],
  }
}
export async function hashClientOutputs(
  root: string,
  files: readonly string[]
) {
  return Promise.all(
    files.map(async (file) => {
      assertClientPath(file)
      return {
        path: file,
        sha256: createHash('sha256')
          .update(await readFile(join(root, file)))
          .digest('hex'),
      }
    })
  )
}
