import type { LoadContext, ResolveContext } from './types'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { isBareSpecifier, resolveSWCOptions } from './utils.js'
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
  // next.config.* are also be imported from the "next/src/server/config.ts"
  // so we expect the parentURL is available.
  if (!context.parentURL) {
    return nextResolve(specifier, context)
  }

  // e.g. "next", "react", etc.
  // Packages that look like bare specifiers depending on the "baseUrl"
  // should already be resolved path by SWC.
  if (isBareSpecifier(specifier)) {
    return nextResolve(specifier, context)
  }

  const url = new URL(specifier, context.parentURL).href

  const ext = extname(specifier)
  // If the specifier has no extension, we try to resolve it as TS then JS.
  if (ext === '') {
    const possibleTsFileURL = new URL(specifier + '.ts', context.parentURL)
    const possibleJsFileURL = new URL(specifier + '.js', context.parentURL)

    if (existsSync(possibleTsFileURL)) {
      return {
        format: 'typescript',
        shortCircuit: true,
        url: possibleTsFileURL.href,
      }
    } else if (existsSync(possibleJsFileURL)) {
      return nextResolve(specifier + '.js', context)
    } else {
      return nextResolve(specifier, context)
    }
  }

  // Node.js resolver can take care of the rest of the non-TS files.
  if (!tsExts.has(ext)) {
    return nextResolve(specifier, context)
  }

  return {
    format: 'typescript',
    shortCircuit: true,
    url,
  }
}

export async function load(
  url: string,
  context: LoadContext,
  nextLoad: Function
) {
  if (context.format !== 'typescript') {
    return nextLoad(url, context)
  }

  const cwd = localContext.get('cwd')
  if (!cwd) {
    throw new Error(
      'The "cwd" value was not passed to the loader from the registration. This is a bug in Next.js.'
    )
  }

  const rawSource =
    '' + (await nextLoad(url, { ...context, format: 'module' })).source

  const swcOptions = resolveSWCOptions(cwd)
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
