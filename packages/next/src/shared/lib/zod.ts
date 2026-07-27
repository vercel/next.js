import type { ZodError } from 'next/dist/compiled/zod'
import { ZodParsedType, util, type ZodIssue } from 'next/dist/compiled/zod'
import { fromZodError } from 'next/dist/compiled/zod-validation-error'
import * as Log from '../../build/output/log'

function processZodErrorMessage(issue: ZodIssue) {
  let message = issue.message

  let path: string

  if (issue.path.length > 0) {
    if (issue.path.length === 1) {
      const identifier = issue.path[0]
      if (typeof identifier === 'number') {
        // The first identifier inside path is a number
        path = `index ${identifier}`
      } else {
        path = `"${identifier}"`
      }
    } else {
      // joined path to be shown in the error message
      path = `"${issue.path.reduce<string>((acc, cur) => {
        if (typeof cur === 'number') {
          // array index
          return `${acc}[${cur}]`
        }
        if (cur.includes('"')) {
          // escape quotes
          return `${acc}["${cur.replaceAll('"', '\\"')}"]`
        }
        // dot notation
        const separator = acc.length === 0 ? '' : '.'
        return acc + separator + cur
      }, '')}"`
    }
  } else {
    path = ''
  }

  if (
    issue.code === 'invalid_type' &&
    issue.received === ZodParsedType.undefined
  ) {
    // Missing key in object.
    return `${path} is missing, expected ${issue.expected}`
  }

  if (issue.code === 'invalid_enum_value') {
    // Remove "Invalid enum value" prefix from zod default error message
    return `Expected ${util.joinValues(issue.options)}, received '${
      issue.received
    }' at ${path}`
  }

  return message + (path ? ` at ${path}` : '')
}

export function normalizeZodErrors(error: ZodError) {
  return error.issues.flatMap((issue) => {
    const issues = [{ issue, message: processZodErrorMessage(issue) }]
    if ('unionErrors' in issue) {
      for (const unionError of issue.unionErrors) {
        issues.push(...normalizeZodErrors(unionError))
      }
    }

    return issues
  })
}

export function formatZodError(prefix: string, error: ZodError) {
  return new Error(fromZodError(error, { prefix: prefix }).toString())
}

export function reportZodError(prefix: string, error: ZodError) {
  Log.error(formatZodError(prefix, error).message)
}
