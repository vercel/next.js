import type { StackFrame } from 'stacktrace-parser'
import type { ServerResponse } from 'http'
import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import isInternal, {
  nextInternalsRe,
  reactNodeModulesRe,
  reactVendoredRe,
} from '../../../../shared/lib/is-internal'

export type SourcePackage = 'react' | 'next'

export interface OriginalStackFrameResponse {
  originalStackFrame?: (StackFrame & { ignored: boolean }) | null
  originalCodeFrame?: string | null
  /** We use this to group frames in the error overlay */
  sourcePackage?: SourcePackage | null
}

const nextMethodRe = /(^__webpack_.*|node_modules[\\/]next[\\/])/

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
    } else if (file.startsWith('[turbopack]/')) {
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
 * @note It ignores Next.js/React internals, as these can often be huge bundled files.
 */
export function getOriginalCodeFrame(
  frame: StackFrame,
  source: string | null
): string | null {
  if (!source || isInternal(frame.file)) {
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
    { forceColor: process.stdout.isTTY }
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

export function jsonString(res: ServerResponse, data: string) {
  res.setHeader('Content-Type', 'application/json').end(Buffer.from(data))
}
