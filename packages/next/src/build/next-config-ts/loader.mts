/* eslint-disable no-undef */
// import type { Options as SWCOptions } from '@swc/core'
import { extname, basename } from 'node:path'
import { transform } from '../swc/index.js'

const tsExts = new Set(['.ts', '.mts', '.cts'])

export async function resolve(
  specifier: string,
  context: any,
  nextResolve: typeof resolve
): Promise<any> {
  const ext = extname(specifier)
  if (!tsExts.has(ext)) {
    return nextResolve(specifier, context, nextResolve)
  }

  const filenameWithoutExt = basename(specifier, ext)
  if (filenameWithoutExt !== 'next.config') {
    return nextResolve(specifier, context, nextResolve)
  }

  // TODO: deduplicate
  const { url } = await nextResolve(filenameWithoutExt, context, nextResolve)

  return {
    format: 'next-config-ts',
    shortCircuit: true,
    url,
  }
}

export async function load(url: string, context: any, nextLoad: any) {
  console.log({ url })
  if (context.format !== 'next-config-ts') {
    return nextLoad(url)
  }

  const rawSource =
    '' +
    (await nextLoad(url, { ...context, format: 'module' }, nextLoad)).source

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
