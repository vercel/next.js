export type HtmlMarkdownExtraction = {
  title?: string
  description?: string
  image?: string
  canonical?: string
  jsonLd: unknown[]
  bodyHtml: string
}

const META_ATTR = /<meta\s+([^>]*?)\s*\/?>/gi
const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i
const CANONICAL = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i
const JSON_LD =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

function attr(source: string, name: string): string | undefined {
  const re = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  )
  const m = source.match(re)
  return m?.[1] ?? m?.[2] ?? m?.[3]
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripTags(html: string, tags: string[]): string {
  let out = html
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
    out = out.replace(re, '')
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }
  return out
}

function extractInner(html: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = html.match(re)
  return m?.[1]
}

function extractByAttr(
  html: string,
  attrName: string,
  value: string
): string | undefined {
  const re = new RegExp(
    `<([a-z0-9]+)\\b[^>]*${attrName}=["']${value}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i'
  )
  return html.match(re)?.[2]
}

export function extractFromHtml(
  html: string,
  options: { contentTags: string[]; stripTags: string[] }
): HtmlMarkdownExtraction {
  const jsonLd: unknown[] = []
  let match: RegExpExecArray | null
  JSON_LD.lastIndex = 0
  while ((match = JSON_LD.exec(html))) {
    try {
      jsonLd.push(JSON.parse(match[1]))
    } catch {
      // skip invalid JSON-LD
    }
  }

  let title: string | undefined
  let description: string | undefined
  let image: string | undefined
  let ogTitle: string | undefined
  let ogDescription: string | undefined
  META_ATTR.lastIndex = 0
  let meta: RegExpExecArray | null
  while ((meta = META_ATTR.exec(html))) {
    const raw = meta[1]
    const name = (
      attr(raw, 'name') ||
      attr(raw, 'property') ||
      ''
    ).toLowerCase()
    const content = attr(raw, 'content')
    if (!content) continue
    if (name === 'title') title = content
    else if (name === 'og:title') ogTitle = content
    else if (name === 'description') description = content
    else if (name === 'og:description') ogDescription = content
    else if (name === 'og:image') image = content
  }
  const titleTag = html.match(TITLE_TAG)?.[1]
  title = title || ogTitle || (titleTag ? decode(titleTag).trim() : undefined)
  description = description || ogDescription

  const canonicalTag = html.match(CANONICAL)?.[0]
  const canonical = canonicalTag ? attr(canonicalTag, 'href') : undefined

  let body = extractInner(html, 'body') ?? html
  for (const tag of options.contentTags) {
    const inner = extractInner(body, tag) || extractByAttr(body, 'role', 'main')
    if (inner && inner.trim()) {
      body = inner
      break
    }
  }
  body = stripTags(body, options.stripTags)
  return { title, description, image, canonical, jsonLd, bodyHtml: body }
}

function convertInline(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, '  \n')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, '\n')
      .replace(/<strong\b[^>]*>|<b\b[^>]*>/gi, '**')
      .replace(/<\/strong>|<\/b>/gi, '**')
      .replace(/<em\b[^>]*>|<i\b[^>]*>/gi, '*')
      .replace(/<\/em>|<\/i>/gi, '*')
      .replace(/<code\b[^>]*>/gi, '`')
      .replace(/<\/code>/gi, '`')
      .replace(
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_, href, text) => {
          const label = convertInline(text).replace(/\n/g, ' ').trim()
          return `[${label}](${href})`
        }
      )
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const src = attr(tag, 'src') || ''
        const alt = attr(tag, 'alt') || ''
        return src ? `![${alt}](${src})` : ''
      })
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

function convertBlocks(html: string): string {
  let out = html
  out = out.replace(
    /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_, level, inner) => {
      return `\n${'#'.repeat(Number(level))} ${convertInline(inner)}\n`
    }
  )
  out = out.replace(
    /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_, inner) => {
      const body = convertBlocks(inner)
        .split('\n')
        .map((line: string) => (line ? `> ${line}` : '>'))
        .join('\n')
      return `\n${body}\n`
    }
  )
  out = out.replace(
    /<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    (_, code) => {
      return `\n\`\`\`\n${decode(code).replace(/\n$/, '')}\n\`\`\`\n`
    }
  )
  out = out.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    return `\n\`\`\`\n${decode(stripTags(code, []))
      .replace(/<[^>]+>/g, '')
      .trimEnd()}\n\`\`\`\n`
  })
  out = out.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    return (
      '\n' +
      inner.replace(
        /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
        (__: string, item: string) => {
          return `- ${convertInline(item)}\n`
        }
      ) +
      '\n'
    )
  })
  out = out.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let i = 0
    return (
      '\n' +
      inner.replace(
        /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
        (__: string, item: string) => {
          i += 1
          return `${i}. ${convertInline(item)}\n`
        }
      ) +
      '\n'
    )
  })
  out = out.replace(/<hr\s*\/?>/gi, '\n---\n')
  out = out.replace(
    /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    (_, inner) => `\n${convertInline(inner)}\n`
  )
  out = out.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) =>
    convertTable(inner)
  )
  return convertInline(out)
}

function convertTable(inner: string): string {
  const rows: string[][] = []
  inner.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_, row) => {
    const cells: string[] = []
    row.replace(
      /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi,
      (__: string, cell: string) => {
        cells.push(convertInline(cell).replace(/\|/g, '\\|'))
        return ''
      }
    )
    if (cells.length) rows.push(cells)
    return ''
  })
  if (!rows.length) return ''
  const header = rows[0]
  const sep = header.map(() => '---')
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`),
  ]
  return `\n${lines.join('\n')}\n`
}

export function htmlBodyToMarkdown(bodyHtml: string): string {
  return convertBlocks(bodyHtml)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}
