import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
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
  /(node_modules[\\/]next[\\/]|[\\/].next[\\/]static[\\/]chunks[\\/]webpack\.js$|(edge-runtime-webpack|webpack-runtime)\.js$)/

const nextMethodRe = /(^__webpack_.*|node_modules[\\/]next[\\/])/

/** Given a potential file path or methodName, it parses which package the file/method belongs to. */
export function findSourcePackage(
  file: string | null,
  methodName: string | null
): SourcePackage | undefined {
  if (file) {
    // matching React first since vendored would match under `next` too
    if (reactVendoredRe.test(file) || reactNodeModulesRe.test(file)) {
      return 'react'
    } else if (nextRe.test(file)) {
      return 'next'
    }
  }

  if (methodName) {
    if (nextMethodRe.test(methodName)) {
      return 'next'
    }
  }
}

export function getOriginalCodeFrame(
  frame: {
    file: string
    lineNumber: number | null
    column: number | null
    methodName: string
    arguments: never[]
  },
  source: string | null
): string | null | undefined {
  if (!source) return null
  return codeFrameColumns(
    source,
    {
      start: {
        // 1-based, but -1 means start line without highlighting
        line: frame.lineNumber ?? -1,
        // 1-based, but 0 means whole line without column highlighting
        column: frame.column ?? 0,
      },
    },
    { forceColor: true }
  )
}
