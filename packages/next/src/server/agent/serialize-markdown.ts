import type { AgentRoute } from './types'

function normalizeText(value: string): string {
  return value.trim().replace(/\n{3,}/g, '\n\n')
}

function serializeActions(actions: AgentRoute.Action[]): string[] {
  if (!actions.length) return []

  const lines: string[] = ['Actions']
  for (const action of actions) {
    const href = action.href ? ` (${action.href})` : ''
    const description = action.description ? ` - ${action.description}` : ''
    lines.push(`- ${action.label}${href}${description}`)
  }
  lines.push('')
  return lines
}

function serializeSection(
  lines: string[],
  section: AgentRoute.Section,
  depth: number
) {
  if (section.title) {
    lines.push(`${'#'.repeat(Math.min(depth, 6))} ${section.title}`)
    lines.push('')
  }

  if (section.summary) {
    lines.push(normalizeText(section.summary))
    lines.push('')
  }

  if (section.url) {
    lines.push(`Source: ${section.url}`)
    lines.push('')
  }

  if (section.content) {
    lines.push(normalizeText(section.content))
    lines.push('')
  }

  if (section.actions?.length) {
    lines.push(...serializeActions(section.actions))
  }

  if (section.sections?.length) {
    for (const child of section.sections) {
      serializeSection(lines, child, depth + 1)
    }
  }
}

export function serializeAgentDocumentToMarkdown(
  document: AgentRoute.Document
): string {
  const lines: string[] = []

  lines.push(`# ${document.title || 'Agent Output'}`)
  lines.push('')

  if (document.summary) {
    lines.push(normalizeText(document.summary))
    lines.push('')
  }

  if (document.canonicalUrl) {
    lines.push(`Canonical: ${document.canonicalUrl}`)
    lines.push('')
  }

  if (document.actions?.length) {
    lines.push(...serializeActions(document.actions))
  }

  if (document.sections?.length) {
    for (const section of document.sections) {
      serializeSection(lines, section, 2)
    }
  }

  return `${lines.join('\n').trim()}\n`
}
