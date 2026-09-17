import {
  MARKDOWN_CONTENT_TYPE_HEADER,
  TEXT_PLAIN_UTF8_CONTENT_TYPE_HEADER,
} from '../../../lib/constants'
import type { NegotiatedType } from './accept'
import { negotiateRepresentation } from './accept'
import { inferActionsFromHtml } from './actions'
import { composeMarkdownDocument } from './compose'
import type { NormalizedMarkdownConfig } from './config'
import {
  estimateTokens,
  extractFromHtml,
  htmlBodyToMarkdown,
} from './html-to-markdown'
import type { AuthoredRepresentation } from './authored'

export type MarkdownTransformResult = {
  body: string
  contentType: string
  markdownTokens?: number
  originalTokens?: number
}

export function representationsForMode(
  config: NormalizedMarkdownConfig,
  authored: AuthoredRepresentation
): NegotiatedType[] {
  const types: NegotiatedType[] = ['html']
  const hasMarkdown = Boolean(authored.markdown) || config.mode !== 'authored'
  const hasPlain = Boolean(authored.plain)
  if (hasMarkdown) types.push('markdown')
  if (hasPlain) types.push('plain')
  return types
}

/**
 * True when auto-converting HTML is required. Authored `page.md` / `page.txt`
 * must not consume a dynamic render stream.
 */
export function shouldBufferHtmlForAgents(
  config: NormalizedMarkdownConfig,
  authored: AuthoredRepresentation,
  chosen: NegotiatedType | null
): boolean {
  if (!chosen || chosen === 'html') return false
  if (chosen === 'plain' && authored.plain) return false
  if (chosen === 'markdown' && authored.markdown) return false
  if (
    chosen === 'markdown' &&
    authored.plain &&
    config.mode === 'prefer-authored'
  ) {
    return false
  }
  return config.mode !== 'authored'
}

export function buildMarkdownFromHtml(
  html: string,
  url: string,
  config: NormalizedMarkdownConfig
): string {
  const extracted = extractFromHtml(html, {
    contentTags: config.contentTags,
    stripTags: config.stripTags,
  })
  const body = htmlBodyToMarkdown(extracted.bodyHtml)
  const actions = config.actions ? inferActionsFromHtml(html, url) : []
  return composeMarkdownDocument(
    {
      title: extracted.title,
      description: extracted.description,
      image: extracted.image,
      canonical: extracted.canonical || url,
      body,
      jsonLd: extracted.jsonLd,
      actions,
      url,
    },
    {
      frontmatter: config.frontmatter,
      jsonLd: config.jsonLd,
      actions: config.actions,
    }
  )
}

export function transformPageRepresentation(options: {
  accept: string | null | undefined
  html: string
  url: string
  config: NormalizedMarkdownConfig
  authored: AuthoredRepresentation
  /** Forced by a `.md` / `.txt` suffix. */
  forced?: NegotiatedType | null
}): MarkdownTransformResult | null {
  const { config, authored, html, url } = options
  if (!config.enabled) return null

  const available = representationsForMode(config, authored)
  const chosen =
    options.forced && available.includes(options.forced)
      ? options.forced
      : negotiateRepresentation(options.accept, available)

  if (!chosen || chosen === 'html') return null

  const originalTokens = config.tokenHeaders ? estimateTokens(html) : undefined

  if (chosen === 'plain') {
    const body = authored.plain ?? authored.markdown ?? ''
    if (!body) return null
    return {
      body,
      contentType: TEXT_PLAIN_UTF8_CONTENT_TYPE_HEADER,
      markdownTokens: config.tokenHeaders ? estimateTokens(body) : undefined,
      originalTokens,
    }
  }

  let body: string | undefined
  if (config.mode === 'auto') {
    body = buildMarkdownFromHtml(html, url, config)
  } else if (authored.markdown) {
    body = authored.markdown.endsWith('\n')
      ? authored.markdown
      : authored.markdown + '\n'
  } else if (authored.plain && config.mode === 'prefer-authored') {
    body = authored.plain.endsWith('\n')
      ? authored.plain
      : authored.plain + '\n'
  } else if (config.mode === 'prefer-authored') {
    body = buildMarkdownFromHtml(html, url, config)
  }

  if (!body) return null
  return {
    body,
    contentType: MARKDOWN_CONTENT_TYPE_HEADER,
    markdownTokens: config.tokenHeaders ? estimateTokens(body) : undefined,
    originalTokens,
  }
}
