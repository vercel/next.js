import { readFile, realpath, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type ResolveContext = { parentURL?: string }
type Resolution = { url: string }
const owned = new Set<string>()
const packages = new Set<string>()
let issuer: string | undefined
let projectURL: string | undefined

export async function initialize(options: {
  entries: string[]
  packages?: string[]
  issuer?: string
  projectURL?: string
}) {
  for (const entry of options.entries)
    owned.add(pathToFileURL(await realpath(entry)).href)
  for (const entry of options.packages ?? []) packages.add(entry)
  issuer = options.issuer
  projectURL = options.projectURL
}

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: (
    specifier: string,
    context: ResolveContext
  ) => Promise<Resolution>
) {
  // Resolve package entries with native import conditions from the actual
  // project, while leaving package dependencies and file adapters untouched.
  if (context.parentURL === issuer && packages.has(specifier) && projectURL)
    return nextResolve(specifier, { ...context, parentURL: projectURL })
  const local =
    context.parentURL !== undefined &&
    owned.has(context.parentURL) &&
    specifier.startsWith('.')
  let result: Resolution
  try {
    result = await nextResolve(specifier, context)
  } catch (error) {
    if (
      !local ||
      !context.parentURL ||
      !['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(
        (error as NodeJS.ErrnoException).code ?? ''
      )
    )
      throw error
    const candidate = fileURLToPath(new URL(specifier, context.parentURL))
    let found: string | undefined
    const extension = extname(candidate)
    const candidates = [
      ...(['.js', '.mjs', '.jsx'].includes(extension)
        ? [
            candidate.slice(0, -extension.length) +
              extension.replace('js', 'ts'),
            ...(extension === '.js'
              ? [candidate.slice(0, -extension.length) + '.tsx']
              : []),
          ]
        : []),
      ...['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx'].map(
        (suffix) => candidate + suffix
      ),
    ]
    // Preserve the pinned resolver's file-before-directory and typed-output order.
    for (const filename of candidates) {
      if (
        await stat(filename).then(
          (value) => value.isFile(),
          () => false
        )
      ) {
        found = filename
        break
      }
    }
    if (
      !found &&
      !(await stat(candidate + '/package.json').then(
        (value) => value.isFile(),
        () => false
      ))
    ) {
      for (const suffix of ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx']) {
        const filename = candidate + '/index' + suffix
        if (
          await stat(filename).then(
            (value) => value.isFile(),
            () => false
          )
        ) {
          found = filename
          break
        }
      }
    }
    if (!found) throw error
    result = await nextResolve(pathToFileURL(found).href, context)
  }
  if (local && result.url.startsWith('file:')) owned.add(result.url)
  return result
}

export async function load(
  url: string,
  context: object,
  nextLoad: (url: string, context: object) => Promise<unknown>
) {
  if (!owned.has(url) || !url.startsWith('file:')) return nextLoad(url, context)
  const filename = fileURLToPath(url)
  const extension = extname(filename)
  if (!['.ts', '.mts', '.jsx', '.tsx'].includes(extension))
    return nextLoad(url, context)
  const source = await readFile(filename, 'utf8')
  const swc =
    require('../../../build/swc') as typeof import('../../../build/swc')
  await swc.loadBindings()
  const result = await swc.transform(source, {
    filename,
    sourceMaps: 'inline',
    jsc: {
      target: 'es2022',
      parser:
        extension === '.jsx'
          ? { syntax: 'ecmascript', jsx: true }
          : {
              syntax: 'typescript',
              ...(extension === '.tsx' ? { tsx: true } : {}),
            },
      ...(['.jsx', '.tsx'].includes(extension)
        ? { transform: { react: { runtime: 'classic' } } }
        : {}),
    },
    module: { type: 'es6', ignoreDynamic: true },
  })
  return { format: 'module', source: result.code, shortCircuit: true }
}
