import type { AgentAction } from './actions'
import { renderActionsMarkdown } from './actions'

export type MarkdownDocument = {
  title?: string
  description?: string
  image?: string
  canonical?: string
  body: string
  jsonLd?: unknown[]
  actions?: AgentAction[]
  url: string
}

function yamlEscape(value: string): string {
  if (
    /[:#\n&*?|>!%@`]/.test(value) ||
    value.includes("'") ||
    value.includes('"')
  ) {
    return JSON.stringify(value)
  }
  return value
}

export function composeMarkdownDocument(
  doc: MarkdownDocument,
  options: { frontmatter: boolean; jsonLd: boolean; actions: boolean }
): string {
  const parts: string[] = []
  if (options.frontmatter) {
    const fields: string[] = []
    if (doc.title) fields.push(`title: ${yamlEscape(doc.title)}`)
    if (doc.description)
      fields.push(`description: ${yamlEscape(doc.description)}`)
    if (doc.canonical) fields.push(`canonical: ${yamlEscape(doc.canonical)}`)
    if (doc.image) fields.push(`image: ${yamlEscape(doc.image)}`)
    if (fields.length) {
      parts.push('---', ...fields, '---', '')
    }
  }
  if (doc.body.trim()) {
    parts.push(doc.body.trim(), '')
  }
  if (options.actions && doc.actions?.length) {
    parts.push(renderActionsMarkdown(doc.actions, doc.url), '')
  }
  if (options.jsonLd && doc.jsonLd?.length) {
    parts.push('```json')
    parts.push(doc.jsonLd.map((item) => JSON.stringify(item)).join('\n'))
    parts.push('```', '')
  }
  return (
    parts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}
