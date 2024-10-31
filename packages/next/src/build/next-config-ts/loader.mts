import { extname } from 'node:path'
import { resolveSWCOptions } from './utils.mjs'
import { transform } from '../swc/index.js'

const tsExts = new Set(['.ts', '.mts', '.cts'])

export async function resolve(
  specifier: string,
  context: {
    conditions: string[]
    importAttributes: Record<string, string>
    parentURL: string | undefined
  },
  nextResolve: Function
): Promise<any> {
  if (!context.parentURL) {
    return nextResolve(specifier, context)
  }

  const ext = extname(specifier)
  if (!tsExts.has(ext)) {
    return nextResolve(specifier, context)
  }

  const { url } = await nextResolve(specifier, context)

  return {
    format: 'next-config-ts',
    shortCircuit: true,
    url,
  }
}

export async function load(url: string, context: any, nextLoad: Function) {
  if (context.format !== 'next-config-ts') {
    return nextLoad(url, context)
  }

  const rawSource =
    '' + (await nextLoad(url, { ...context, format: 'module' })).source

  const swcOptions = await resolveSWCOptions(url)
  const { code: source } = await transform(rawSource, swcOptions)

  const ext = extname(url)
  const shouldBeCJS = ext === '.cts'

  return {
    format: shouldBeCJS ? 'commonjs' : 'module',
    shortCircuit: true,
    source,
  }
}
