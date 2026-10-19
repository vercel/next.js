import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ConfigurationImportFiles } from './config-imports'

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).sort().join(',') === expected.sort().join(',')

/** Validate only actual loaded module files/import edges, not arbitrary config IO. */
export async function assertConfigurationImportFiles(
  value: unknown,
  configFile: string | null,
  signal: AbortSignal
): Promise<ConfigurationImportFiles> {
  signal.throwIfAborted()
  if (
    !object(value) ||
    !keys(value, ['version', 'configFile', 'inputs', 'imports']) ||
    value.version !== 1 ||
    value.configFile !== configFile ||
    !Array.isArray(value.inputs) ||
    !Array.isArray(value.imports)
  )
    throw new Error('Unrequested Next config module import certificate.')
  const files = new Set<string>()
  for (const input of value.inputs) {
    if (
      !object(input) ||
      !keys(input, ['file', 'sha256']) ||
      typeof input.file !== 'string' ||
      !isAbsolute(input.file) ||
      resolve(input.file) !== input.file ||
      typeof input.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.sha256) ||
      files.has(input.file)
    )
      throw new Error('Invalid Next config module input identity.')
    files.add(input.file)
    signal.throwIfAborted()
    const before = await lstat(input.file, { bigint: true })
    if (!before.isFile() || (await realpath(input.file)) !== input.file)
      throw new Error(
        'Next config module input is no longer a canonical regular file.'
      )
    const bytes = await readFile(input.file),
      after = await lstat(input.file, { bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      createHash('sha256').update(bytes).digest('hex') !== input.sha256
    )
      throw new Error(
        'Next config imported module changed after its actual load.'
      )
  }
  const edges = new Map<string, string[]>(),
    seenEdges = new Set<string>()
  for (const edge of value.imports) {
    if (
      !object(edge) ||
      !keys(edge, ['kind', 'parent', 'request', 'target']) ||
      (edge.kind !== 'commonjs' && edge.kind !== 'module') ||
      typeof edge.parent !== 'string' ||
      typeof edge.request !== 'string' ||
      typeof edge.target !== 'string' ||
      !files.has(edge.parent) ||
      !files.has(edge.target)
    )
      throw new Error('Invalid Next config import graph edge.')
    let requested: string | undefined
    try {
      if (edge.kind === 'commonjs') {
        if (edge.request.startsWith('.'))
          requested = resolve(edge.parent, '..', edge.request)
        else if (isAbsolute(edge.request)) requested = resolve(edge.request)
      } else if (
        edge.request.startsWith('.') ||
        edge.request.startsWith('file:') ||
        isAbsolute(edge.request)
      ) {
        const url = new URL(edge.request, pathToFileURL(edge.parent))
        if (url.protocol === 'file:' && !url.host && !url.search && !url.hash)
          requested = fileURLToPath(url)
      }
    } catch {}
    const id = JSON.stringify([
      edge.kind,
      edge.parent,
      edge.request,
      edge.target,
    ])
    if (
      !requested ||
      !extname(requested) ||
      requested !== edge.target ||
      seenEdges.has(id)
    )
      throw new Error(
        'Next config import request no longer has its certified file identity.'
      )
    seenEdges.add(id)
    edges.set(edge.parent, [...(edges.get(edge.parent) ?? []), edge.target])
  }
  if (configFile === null) {
    if (files.size || value.imports.length)
      throw new Error(
        'Default Next config cannot borrow module input certificates.'
      )
  } else {
    if (!files.has(configFile))
      throw new Error(
        'Next config selected module is absent from its import certificate.'
      )
    const visited = new Set<string>(),
      queue = [configFile]
    while (queue.length) {
      const file = queue.pop()!
      if (visited.has(file)) continue
      visited.add(file)
      queue.push(...(edges.get(file) ?? []))
    }
    if (visited.size !== files.size)
      throw new Error(
        'Next config import certificate contains an unrelated module.'
      )
  }
  signal.throwIfAborted()
  return structuredClone(value) as unknown as ConfigurationImportFiles
}
