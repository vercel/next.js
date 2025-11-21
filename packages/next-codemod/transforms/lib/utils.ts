import type { FileInfo } from 'jscodeshift'
import path from 'node:path'

export function isNextConfigFile(file: FileInfo): boolean {
  const parsed = path.parse(file.path || '/')
  return (
    parsed.base === 'next.config.js' ||
    parsed.base === 'next.config.ts' ||
    parsed.base === 'next.config.mjs' ||
    parsed.base === 'next.config.cjs'
  )
}
