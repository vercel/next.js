import type { LoadContext, ResolveContext } from './types'
import { extname } from 'node:path'
import { resolveSWCOptions } from './utils.js'
import { transform } from '../swc/index.js'

const tsExts = new Set(['.ts', '.mts', '.cts'])
const localContext = new Map<string, string>()

export async function initialize({ cwd }: { cwd: string }) {
  localContext.set('cwd', cwd)
}

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: Function
) {
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

export async function load(
  url: string,
  context: LoadContext,
  nextLoad: Function
) {
  if (context.format !== 'next-config-ts') {
    return nextLoad(url, context)
  }

  const rawSource =
    '' + (await nextLoad(url, { ...context, format: 'module' })).source

  const cwd = localContext.get('cwd')
  if (!cwd) {
    throw new Error(
      '"cwd" value was not passed from loadConfig to "load" loader. This is a bug in Next.js.'
    )
  }

  const swcOptions = await resolveSWCOptions(url, cwd)
  const { code } = await transform(rawSource, swcOptions)

  return {
    // TODO(jiwon): Support format `commonjs` and drop the require hooks.
    // `source` is ignored when `format` is `commonjs` on Node.js v18.
    // x-ref: https://github.com/nodejs/node/issues/55630
    format: 'module',
    shortCircuit: true,
    source: code,
  }
}
