import type { AuthoredRepresentation } from './authored'
import type { NormalizedMarkdownConfig } from './config'
import { transformPageRepresentation } from './transform'

/**
 * Build the Markdown body to store next to HTML/RSC on an App page cache
 * entry. Static and ISR renders call this once; dynamic renders leave it
 * empty and convert at request time.
 */
export function buildCachedMarkdown(options: {
  html: string
  url: string
  config: NormalizedMarkdownConfig
  authored: AuthoredRepresentation
}): string | undefined {
  if (!options.config.enabled || !options.html) {
    return undefined
  }
  return transformPageRepresentation({
    accept: 'text/markdown',
    html: options.html,
    url: options.url,
    config: options.config,
    authored: options.authored,
  })?.body
}
