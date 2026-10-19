import { createHash } from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import { lstat, readFile, realpath } from 'node:fs/promises'
import type { MessagePort } from 'node:worker_threads'
import { extname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

interface ObservedFile {
  file: string
  sha256?: string
  error?: string
}
interface ImportEdge {
  kind: 'commonjs' | 'module'
  parent: string
  request: string
  target?: string
  error?: string
}
const files = new Map<string, ObservedFile>()
const edges: ImportEdge[] = []

function file(url: string): string | undefined {
  if (!url.startsWith('file:')) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.search || parsed.hash || parsed.host) return undefined
    return fileURLToPath(parsed)
  } catch {
    return undefined
  }
}

export function initialize(options: { port: MessagePort }) {
  options.port.on('message', (id: string) =>
    options.port.postMessage({ id, files: [...files.values()], edges })
  )
  options.port.unref()
}

export async function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: Function
) {
  // Delegate the actual resolver exactly once, with its untouched context.
  const result = await nextResolve(specifier, context)
  const parent = context.parentURL && file(context.parentURL)
  if (parent && !result.url.startsWith('node:')) {
    const target = file(result.url)
    let requested: string | undefined
    try {
      if (specifier.startsWith('.') || specifier.startsWith('file:'))
        requested = file(new URL(specifier, context.parentURL).href)
      else if (isAbsolute(specifier)) requested = resolvePath(specifier)
    } catch {}
    edges.push({
      kind: 'module',
      parent,
      request: specifier,
      ...(target ? { target } : {}),
      ...(!requested || !target || requested !== target || !extname(requested)
        ? {
            error:
              'Next config imports require canonical explicit file requests; package and extensionless resolution are not certified.',
          }
        : {}),
    })
  }
  return result
}

export async function load(url: string, context: object, nextLoad: Function) {
  const filename = file(url)
  let before: BigIntStats | undefined
  if (filename)
    before = await lstat(filename, { bigint: true }).catch(() => undefined)
  const result = await nextLoad(url, context)
  if (
    filename &&
    result.source !== undefined &&
    result.source !== null &&
    result.format !== 'commonjs' &&
    result.format !== 'commonjs-typescript'
  ) {
    try {
      if (!['module', 'module-typescript', 'json'].includes(result.format))
        throw new Error(
          'Next config imported module format has no source certificate.'
        )
      if (!before?.isFile() || (await realpath(filename)) !== filename)
        throw new Error('Next config import is not a canonical regular file.')
      const bytes = await readFile(filename),
        after = await lstat(filename, { bigint: true })
      const hash = createHash('sha256').update(bytes).digest('hex')
      const loaded = Buffer.from(result.source)
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        createHash('sha256').update(loaded).digest('hex') !== hash
      )
        throw new Error(
          'Next config imported bytes changed or were transformed during loading.'
        )
      const previous = files.get(filename)
      files.set(
        filename,
        previous && previous.sha256 !== hash
          ? {
              file: filename,
              error:
                'Next config import was reloaded with different bytes in the retained realm.',
            }
          : { file: filename, sha256: hash }
      )
    } catch (error) {
      files.set(filename, {
        file: filename,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}
