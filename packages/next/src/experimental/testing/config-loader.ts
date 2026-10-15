import { readFile, stat, realpath } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let apiPath: string
const owned = new Set<string>()
export async function initialize(options: { apiPath: string; entry?: string }) {
  apiPath = options.apiPath
  if (options.entry)
    owned.add(pathToFileURL(await realpath(options.entry)).href)
}
export async function resolve(
  specifier: string,
  context: { parentURL?: string; conditions?: string[] },
  nextResolve: Function
) {
  if (specifier === 'vitest/config' || specifier === 'vite') {
    if (context.conditions?.includes('require'))
      return { url: pathToFileURL(apiPath).href, shortCircuit: true }
    const source = `import api from ${JSON.stringify(pathToFileURL(apiPath).href)};${[
      'defineConfig',
      'defineProject',
      'mergeConfig',
      'configDefaults',
      'coverageConfigDefaults',
      'defaultBrowserPort',
      'defaultInclude',
      'defaultExclude',
    ]
      .map((name) => `export const ${name}=api.${name};`)
      .join('')}`
    return {
      url: `data:text/javascript,${encodeURIComponent(source)}`,
      shortCircuit: true,
    }
  }
  if (
    specifier === 'vitest' ||
    specifier.startsWith('vitest/') ||
    specifier.startsWith('vite/')
  )
    throw new Error(
      `Test configuration cannot load the ${specifier} runner/controller. Use the inert vitest/config adapter.`
    )
  const parentOwned = context.parentURL && owned.has(context.parentURL)
  let result: { url: string }
  try {
    result = await nextResolve(specifier, context)
  } catch (error) {
    if (!parentOwned || !context.parentURL || !specifier.startsWith('.'))
      throw error
    const candidate = fileURLToPath(new URL(specifier, context.parentURL))
    let found: string | undefined
    for (const suffix of [
      '.ts',
      '.mts',
      '.cts',
      '.tsx',
      '.js',
      '.mjs',
      '.cjs',
      '.jsx',
      '/index.ts',
      '/index.js',
    ]) {
      if (
        await stat(candidate + suffix).then(
          (value) => value.isFile(),
          () => false
        )
      ) {
        found = candidate + suffix
        break
      }
    }
    if (!found) throw error
    result = await nextResolve(pathToFileURL(found).href, context)
  }
  if (
    (parentOwned || specifier.startsWith('file:')) &&
    result.url.startsWith('file:') &&
    !fileURLToPath(result.url).includes(`${join('node_modules', '')}/`)
  )
    owned.add(result.url)
  return result
}
async function packageType(file: string): Promise<'module' | 'commonjs'> {
  let dir = dirname(file)
  while (true) {
    try {
      return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
        .type === 'module'
        ? 'module'
        : 'commonjs'
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = dirname(dir)
    if (parent === dir) return 'commonjs'
    dir = parent
  }
}
export async function load(url: string, context: object, nextLoad: Function) {
  if (!owned.has(url) || !url.startsWith('file:')) return nextLoad(url, context)
  const file = fileURLToPath(url)
  const extension = extname(file)
  if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(extension)) return nextLoad(url, context)
  const source = await readFile(file, 'utf8')
  const swc = require('../../build/swc') as typeof import('../../build/swc')
  await swc.loadBindings()
  const syntax = /\.(?:[cm]?ts|tsx)$/.test(extension)
    ? 'typescript'
    : 'ecmascript'
  const parsed = await swc.parse(source, {
    filename: file,
    jsc: {
      parser: { syntax, tsx: extension === '.tsx', jsx: extension === '.jsx' },
    },
  })
  const hasModules = parsed.body.some((node: { type: string }) =>
    /^(?:Import|Export)/.test(node.type)
  )
  const format = /\.(?:cjs|cts)$/.test(extension)
    ? 'commonjs'
    : /\.(?:mjs|mts)$/.test(extension) || hasModules
      ? 'module'
      : await packageType(file)
  const code = await swc.transform(source, {
    filename: file,
    sourceMaps: 'inline',
    jsc: {
      target: 'es2022',
      parser: { syntax, tsx: extension === '.tsx', jsx: extension === '.jsx' },
    },
    module: {
      type: format === 'module' ? 'es6' : 'commonjs',
      ignoreDynamic: true,
    },
  })
  return { format, source: code.code, shortCircuit: true }
}
