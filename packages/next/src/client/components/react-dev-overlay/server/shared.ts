import type { StackFrame } from 'stacktrace-parser'
import type { ServerResponse } from 'http'
import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'

export type SourcePackage = 'react' | 'next'

export interface OriginalStackFrameResponse {
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

const nextInternalsRe =
  /(node_modules[\\/]next[\\/]|[\\/].next[\\/]static[\\/]chunks[\\/]webpack\.js$|(edge-runtime-webpack|webpack-runtime)\.js$)/

const nextMethodRe = /(^__webpack_.*|node_modules[\\/]next[\\/])/

function isInternal(file: string | null) {
  if (!file) return false

  return (
    nextInternalsRe.test(file) ||
    reactVendoredRe.test(file) ||
    reactNodeModulesRe.test(file)
  )
}

/** Given a frame, it parses which package it belongs to. */
export function findSourcePackage({
  file,
  methodName,
}: Partial<{ file: string | null; methodName: string | null }>):
  | SourcePackage
  | undefined {
  if (file) {
    // matching React first since vendored would match under `next` too
    if (reactVendoredRe.test(file) || reactNodeModulesRe.test(file)) {
      return 'react'
    } else if (nextInternalsRe.test(file)) {
      return 'next'
    }
  }

  if (methodName) {
    if (nextMethodRe.test(methodName)) {
      return 'next'
    }
  }
}

/**
 * It looks up the code frame of the traced source.
 * @note It ignores node_modules or Next.js/React internals, as these can often be huge budnled files.
 */
export function getOriginalCodeFrame(
  frame: StackFrame,
  source: string | null
): string | null | undefined {
  if (
    !source ||
    frame.file?.includes('node_modules') ||
    isInternal(frame.file)
  ) {
    return null
  }

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

export function noContent(res: ServerResponse) {
  res.statusCode = 204
  res.end('No Content')
}

export function badRequest(res: ServerResponse) {
  res.statusCode = 400
  res.end('Bad Request')
}

export function internalServerError(res: ServerResponse, e?: any) {
  res.statusCode = 500
  res.end(e ?? 'Internal Server Error')
}

export function json(res: ServerResponse, data: any) {
  res
    .setHeader('Content-Type', 'application/json')
    .end(Buffer.from(JSON.stringify(data)))
}
