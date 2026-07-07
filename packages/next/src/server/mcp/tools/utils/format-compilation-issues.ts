import type { Issue, StyledString } from '../../../../build/swc/types'
import stripAnsi from 'next/dist/compiled/strip-ansi'

/** Convert a StyledString tree to Markdown. */
function styledStringToMarkdown(s: StyledString): string {
  switch (s.type) {
    case 'text':
      return s.value
    case 'code':
      return `\`${s.value}\``
    case 'strong':
      return `**${s.value}**`
    case 'line':
      return s.value.map(styledStringToMarkdown).join('')
    case 'stack':
      return s.value.map(styledStringToMarkdown).join('\n')
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
  /** Code frame with ANSI codes stripped */
  codeFrame?: string
}

/**
 * Transform raw Turbopack issues into a clean format for MCP consumers:
 * - Converts StyledString trees (title/description/detail) to Markdown
 * - Strips ANSI codes from code frames
 * - Converts 0-indexed source positions to 1-indexed
 * - Deduplicates issues (same error can surface from multiple endpoints)
 */
export function formatCompilationIssues(issues: Issue[]): FormattedIssue[] {
  const seen = new Set<string>()
  const formattedIssues: FormattedIssue[] = []

  for (const issue of issues) {
    const title = styledStringToMarkdown(issue.title)
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
        ? styledStringToMarkdown(issue.description)
        : undefined,
      detail: issue.detail ? styledStringToMarkdown(issue.detail) : undefined,
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

  return formattedIssues
}
