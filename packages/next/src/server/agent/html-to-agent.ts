import type { AgentRoute } from './types'

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|#39|nbsp);/g,
    (entity) => HTML_ENTITY_MAP[entity] ?? entity
  )
}

function getTagText(html: string, tagName: string): string | undefined {
  const match = html.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  )
  if (!match) return undefined
  return decodeHtmlEntities(match[1]).trim() || undefined
}

function getMetaContent(html: string, name: string): string | undefined {
  const match = html.match(
    new RegExp(
      `<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      'i'
    )
  )
  if (!match) return undefined
  return decodeHtmlEntities(match[1]).trim() || undefined
}

function getPrimaryContentHtml(html: string): string {
  for (const tagName of ['main', 'article', 'body']) {
    const match = html.match(
      new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
    )
    if (match?.[1]) {
      return match[1]
    }
  }

  return html
}

function htmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

  text = text.replace(
    /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_all, href: string, label: string) => {
      const normalizedLabel = label.replace(/<[^>]+>/g, '').trim()
      return normalizedLabel ? `[${normalizedLabel}](${href})` : href
    }
  )

  text = text
    .replace(/<(h1|h2|h3|h4|h5|h6)[^>]*>/gi, (_all, heading: string) => {
      const level = Number(heading[1] ?? '2')
      return `\n${'#'.repeat(level)} `
    })
    .replace(/<\/(h1|h2|h3|h4|h5|h6)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|ul|ol|table|pre)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')

  text = decodeHtmlEntities(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

function makeSummary(description: string | undefined, content: string): string {
  if (description) return description

  const compact = content.replace(/\s+/g, ' ').trim()
  if (!compact) return ''

  return compact.length <= 220 ? compact : `${compact.slice(0, 217)}...`
}

function hasMeaningfulContent(content: string): boolean {
  const alnumCount = content.replace(/[^a-zA-Z0-9]/g, '').length
  return alnumCount >= 40
}

export function htmlToAgentDocument(
  html: string,
  options?: {
    canonicalUrl?: string
    fallbackTitle?: string
  }
): AgentRoute.Document {
  const title =
    getTagText(html, 'title') || options?.fallbackTitle || 'Agent Output'
  const description = getMetaContent(html, 'description')
  const content = htmlToText(getPrimaryContentHtml(html))
  const meaningful = hasMeaningfulContent(content)

  const sections: AgentRoute.Section[] = meaningful
    ? [
        {
          title: 'Content',
          content,
        },
      ]
    : [
        {
          title: 'Content',
          content: 'See the canonical page for full content.',
        },
      ]

  return {
    title,
    summary: makeSummary(description, content),
    canonicalUrl: options?.canonicalUrl,
    sections,
  }
}
