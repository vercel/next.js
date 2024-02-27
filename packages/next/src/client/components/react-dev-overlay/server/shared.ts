import type { StackFrame } from 'stacktrace-parser'

export type SourcePackage = 'react' | 'next'

export type OriginalStackFrameResponse = {
  originalStackFrame?: StackFrame | null
  originalCodeFrame?: string | null
  /** We use this to group frames in the error overlay */
  sourcePackage?: SourcePackage | null
}

/** React that's compiled with `next`. Used by App Router. */
const reactVendoredRe =
  /[\\/]next[\\/]dist[\\/]compiled[\\/](react|react-dom|react-server-dom-(webpack|turbopack)|scheduler)[\\/]/

/** React the user installed. Used by Pages Router, or user imports in App Router. */
const reactNodeModulesRe = /node_modules[\\/](react|react-dom|scheduler)[\\/]/

const nextRe =
  /(node_modules[\\/]next[\\/]|[\\/].next[\\/]static[\\/]chunks[\\/]webpack\.js$)/

/** Given a potential file path, it parses which package the file belongs to. */
export function findSourcePackage(
  file: string | null
): SourcePackage | undefined {
  if (!file) return

  // matching React first since vendored would match under `next` too
  if (reactVendoredRe.test(file) || reactNodeModulesRe.test(file)) {
    return 'react'
  } else if (nextRe.test(file)) {
    return 'next'
  }
}
