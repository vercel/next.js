import type { Rule } from 'eslint'

const DEFAULT_PAGE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx']

export function getConfiguredPageExtensions(context: Rule.RuleContext): string[] {
  const settings = context.settings?.next as {
    pageExtensions?: unknown
  } | undefined
  const configured = Array.isArray(settings?.pageExtensions)
    ? settings?.pageExtensions
    : undefined

  if (configured && configured.length > 0) {
    const normalized = configured
      .filter((ext): ext is string => typeof ext === 'string')
      .map((ext) => ext.trim())
      .filter(Boolean)
      .map((ext) => ext.replace(/^\./, '').toLowerCase())

    if (normalized.length > 0) {
      return Array.from(new Set(normalized))
    }
  }

  return DEFAULT_PAGE_EXTENSIONS
}
