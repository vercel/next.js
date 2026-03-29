import type {
  Diagnostics,
  Issue,
  StyledString,
} from '../../../../build/swc/types'
import stripAnsi from 'next/dist/compiled/strip-ansi'

/** Flatten a StyledString tree to plain text, discarding all styling. */
function flattenStyledString(s: StyledString): string {
  switch (s.type) {
    case 'text':
    case 'code':
    case 'strong':
      return s.value
    case 'line':
      return s.value.map(flattenStyledString).join('')
    case 'stack':
      return s.value.map(flattenStyledString).join('\n')
    default:
      return ''
  }
}

export interface FormattedIssue {
  severity: string
  filePath: string
  title: string
  description?: string
  detail?: string
  source?: {
    filePath: string
    range?: {
      /** 1-indexed */
      start: { line: number; column: number }
      /** 1-indexed */
      end: { line: number; column: number }
    }
  }
  /** Plain-text code frame (ANSI codes stripped) */
  codeFrame?: string
}

/**
 * Turbopack telemetry diagnostics (EVENT_BUILD_FEATURE_USAGE) track feature
 * adoption internally and are not actionable for the user.
 */
const TELEMETRY_DIAGNOSTIC_NAME = 'EVENT_BUILD_FEATURE_USAGE'

/**
 * Transform raw Turbopack issues and diagnostics into a clean format for MCP
 * consumers:
 * - Flattens StyledString trees (title/description/detail) to plain strings
 * - Strips ANSI codes from code frames
 * - Converts 0-indexed source positions to 1-indexed
 * - Deduplicates issues (same error can surface from multiple endpoints)
 * - Excludes telemetry diagnostics (EVENT_BUILD_FEATURE_USAGE)
 */
export function formatCompilationIssues(
  issues: Issue[],
  diagnostics: Diagnostics[]
): { issues: FormattedIssue[]; diagnostics: Diagnostics[] } {
  const seen = new Set<string>()
  const formattedIssues: FormattedIssue[] = []

  for (const issue of issues) {
    const title = flattenStyledString(issue.title)
    // Include source position in the key so two distinct errors in the same
    // file with the same message are not collapsed into one.
    const startLine = issue.source?.range?.start.line ?? ''
    const startCol = issue.source?.range?.start.column ?? ''
    const key = `${issue.severity}|${issue.filePath}|${title}|${startLine}:${startCol}`
    if (seen.has(key)) continue
    seen.add(key)

    const { range } = issue.source ?? {}
    formattedIssues.push({
      severity: issue.severity,
      filePath: issue.filePath,
      title,
      description: issue.description
        ? flattenStyledString(issue.description)
        : undefined,
      detail: issue.detail ? flattenStyledString(issue.detail) : undefined,
      source: issue.source
        ? {
            filePath: issue.source.source.filePath,
            range: range
              ? {
                  start: {
                    line: range.start.line + 1,
                    column: range.start.column + 1,
                  },
                  end: {
                    line: range.end.line + 1,
                    column: range.end.column + 1,
                  },
                }
              : undefined,
          }
        : undefined,
      codeFrame: issue.codeFrame ? stripAnsi(issue.codeFrame) : undefined,
    })
  }

  const filteredDiagnostics = diagnostics.filter(
    (d) => d.name !== TELEMETRY_DIAGNOSTIC_NAME
  )

  return { issues: formattedIssues, diagnostics: filteredDiagnostics }
}
