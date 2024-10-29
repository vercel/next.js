// import type { Options as SWCOptions } from '@swc/core'
import { extname, basename } from 'node:path'
import { transform } from '../swc'

const tsExts = new Set(['.ts', '.mts', '.cts'])

export async function resolve(specifier: string, _ctx: any, nextResolve: any) {
  const ext = extname(specifier)
  if (!tsExts.has(ext)) {
    return nextResolve(specifier)
  }

  console.log({ specifier })
  const filenameWithoutExt = basename(specifier, ext)
  if (filenameWithoutExt !== 'next.config') {
    return nextResolve(specifier)
  }

  // TODO: deduplicate
  const { url } = await nextResolve(filenameWithoutExt)

  return {
    format: 'next-config-ts',
    shortCircuit: true,
    url,
  }
}

export async function load(url: string, ctx: any, nextLoad: any) {
  if (ctx.format !== 'next-config-ts') {
    return nextLoad(url)
  }

  const rawSource =
    '' + (await nextLoad(url, { ...ctx, format: 'module' })).source

  const { code: source } = await transform(rawSource, resolveSWCOptions())

  return {
    format: 'module',
    shortCircuit: true,
    source,
  }
}

function resolveSWCOptions(): any {
  return {}
}
