/**
 * Pure utility functions for TUI log rendering.
 * No React/ink dependencies so they can be tested directly.
 */

import type { TuiLogEntry, LogFilter } from './types'

// Fixed timestamp width: "HH:MM:SS " = 9 chars
export const TIMESTAMP_WIDTH = 9

export function fitText(text: string, max: number): string {
  if (text.length <= max) return text
  return max > 3
    ? text.slice(0, max - 2) + '..'
    : text.slice(0, Math.max(1, max))
}

// Wrap text to fit within available width, returning array of lines.
export function wrapText(
  text: string,
  firstLineMax: number,
  continuationMax?: number
): string[] {
  if (firstLineMax <= 0) return [text]

  const lines: string[] = []
  let remaining = text
  let maxWidth = firstLineMax

  while (remaining.length > maxWidth) {
    let breakAt = remaining.lastIndexOf(' ', maxWidth)
    if (breakAt <= 0) breakAt = maxWidth

    lines.push(remaining.slice(0, breakAt))
    remaining = remaining.slice(breakAt).trimStart()
    if (continuationMax !== undefined) maxWidth = continuationMax
  }

  if (remaining) lines.push(remaining)
  return lines.length > 0 ? lines : ['']
}

export function getSourceLabel(
  source?: string
): { label: string; color: string } | null {
  if (source === 'browser') return { label: 'browser', color: 'blue' }
  if (source === 'userland' || source === 'server')
    return { label: 'server', color: 'cyan' }
  return null
}

export function getStatusColor(status: number): string {
  if (status >= 500) return 'red'
  if (status >= 400) return 'yellow'
  if (status >= 300) return 'cyan'
  return 'green'
}

export function isCacheHit(status?: string): boolean {
  return status === 'hit' || status === 'hmr'
}

export function getCacheColor(status?: string): string {
  return isCacheHit(status) ? 'green' : 'yellow'
}

export type RequestCategory =
  | 'page'
  | 'api'
  | 'static'
  | 'hmr'
  | 'rsc'
  | 'other'

export function categorizeRequest(path: string): {
  category: RequestCategory
  routeName: string
} {
  if (path.includes('/_next/webpack-hmr') || path.includes('__webpack_hmr')) {
    return { category: 'hmr', routeName: 'Hot Reload' }
  }
  if (/[?&]_rsc=/.test(path) || path.endsWith('.rsc')) {
    return {
      category: 'rsc',
      routeName: `RSC ${path.replace(/[?].*$/, '').replace('.rsc', '')}`,
    }
  }
  if (path.startsWith('/_next/static/')) {
    const type = path.includes('/chunks/')
      ? 'chunk'
      : path.includes('/css/')
        ? 'css'
        : 'asset'
    return { category: 'static', routeName: type }
  }
  if (path.startsWith('/_next/'))
    return { category: 'static', routeName: 'internal' }
  if (path.startsWith('/api/'))
    return { category: 'api', routeName: path.replace(/[?].*$/, '') }
  if (path.match(/\.(ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot)$/)) {
    return { category: 'static', routeName: 'asset' }
  }
  return { category: 'page', routeName: path.replace(/[?].*$/, '') || '/' }
}

export const CATEGORY_COLORS: Record<RequestCategory, string> = {
  page: 'green',
  api: 'blue',
  rsc: 'magenta',
  static: 'gray',
  hmr: 'yellow',
  other: 'white',
}

export function stripConsoleFormatting(msg: string): string {
  if (!msg.includes('%c')) return msg
  return msg
    .replace(/%c/g, '')
    .replace(/\[\[?|\]\]?/g, '')
    .replace(/\s+[\w-]+:[\w#(),-]+(?:;\s*[\w-]+:[\w#(),-]+)*\s*$/g, '')
    .trim()
}

export function parseStack(stack: string): {
  location?: string
  stackLines: string[]
} {
  const stackLines: string[] = []
  let location: string | undefined

  for (const line of stack.split('\n').slice(1)) {
    const trimmed = line.trim()
    if (
      trimmed.includes('node:') ||
      trimmed.includes('webpack') ||
      trimmed.includes('node_modules') ||
      trimmed.includes('console-file.tsx')
    ) {
      continue
    }
    const match = trimmed.match(/at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?$/)
    if (match) {
      const file = match[1]
        .replace(/^webpack:\/\/[^/]+\//, '')
        .replace(/^\(/, '')
        .replace(/\)$/, '')
      if (!file.includes('node_modules') && !file.startsWith('node:')) {
        if (!location) {
          location = `${file}:${match[2]}:${match[3]}`
        }
        stackLines.push(trimmed)
      }
    }
  }
  return { location, stackLines }
}

export function parseErrorWithLocation(
  msg: string
): { file?: string; line?: number; col?: number; message: string } | null {
  const match = msg.match(/^[⨯⚠]\s*(.+?)\s*\((\d+):(\d+)\)\s*(.*)$/)
  if (match) {
    return {
      file: match[1],
      line: parseInt(match[2], 10),
      col: parseInt(match[3], 10),
      message: match[4] || match[1],
    }
  }
  return null
}

export function urlPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}

// Startup banner lines — already shown in the TUI header, so filter
// them from the log panel to avoid duplication.
export function isStartupNoise(msg: string): boolean {
  return (
    /^\s*▲\s*Next\.js\s/.test(msg) ||
    /^\s*-\s*(Local|Network):\s+http/.test(msg) ||
    /^\s*✓\s*Ready in\s/.test(msg)
  )
}

export function matchesFilter(log: TuiLogEntry, filter: LogFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'browser') return log.source === 'browser'
  if (filter === 'errors') return log.level === 'error'
  if (filter === 'warnings')
    return log.level === 'warn' || log.level === 'error'
  if (filter === 'requests') return log.structured?.type === 'request'
  return true
}

// Format a log entry for clipboard copy
export function formatLogForCopy(log: TuiLogEntry): string {
  const time = new Date(log.timestamp).toISOString()
  const data = log.structured

  if (data?.type === 'request') {
    let text = `[${time}] ${data.method} ${data.url} ${data.status} ${data.totalTime}ms`
    if (data.fetchMetrics?.length) {
      text += `\nFetches: ${data.fetchMetrics.length}`
      for (const f of data.fetchMetrics) {
        text += `\n  ${f.method} ${f.url} ${f.status} ${f.totalTime}ms ${f.cacheStatus || ''}`
      }
    }
    return text
  }

  if (data?.type === 'console') {
    let text = `[${time}] [${data.source}] ${data.message}`
    if (data.location) text += `\n  at ${data.location}`
    if (data.stack?.length) {
      text += '\n' + data.stack.slice(0, 10).join('\n')
    }
    return text
  }

  if (data?.type === 'fetch') {
    let text = `[${time}] ${data.method} ${data.url} ${data.status} ${data.totalTime}ms`
    if (data.cacheStatus) text += ` (${data.cacheStatus})`
    if (data.cacheReason) text += ` ← ${data.cacheReason}`
    return text
  }

  // Fallback to message + extra lines
  let text = `[${time}] ${log.message}`
  if (log.extraLines?.length) text += '\n' + log.extraLines.join('\n')
  return text
}
