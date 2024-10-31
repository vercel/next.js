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

  const cwd = localContext.get('cwd')
  if (!cwd) {
    throw new Error(
      '"cwd" value was not passed from loadConfig to "load" loader. This is a bug in Next.js.'
    )
  }

  const swcOptions = await resolveSWCOptions(url, cwd)
  const { code: source } = await transform(rawSource, swcOptions)

  const ext = extname(url)
  const shouldBeCJS = ext === '.cts'

  return {
    format: shouldBeCJS ? 'commonjs' : 'module',
    shortCircuit: true,
    source,
  }
}
