export type MarkdownForAgentsMode = 'auto' | 'authored' | 'prefer-authored'

export type MarkdownForAgentsOptions = {
  /**
   * Serve Markdown (and optionally plain text) for App Router pages.
   * Off by default.
   */
  enabled?: boolean
  /**
   * How to pick a representation:
   * - `prefer-authored` (default): `page.md` then `page.txt`, else auto-convert HTML
   * - `authored`: only sibling files; never auto-convert
   * - `auto`: always convert HTML, even when a sibling file exists
   */
  mode?: MarkdownForAgentsMode
  /**
   * Append a machine-readable Actions section (YAML + HTTP examples) so agents
   * can POST to the same URL. Default `true` when enabled.
   */
  actions?: boolean
  /**
   * Also expose Markdown at the same pathname with a `.md` or `.txt` suffix
   * (`/about.md`). The canonical URL without a suffix remains the default.
   * Off by default.
   */
  suffix?: boolean
  /** Include YAML frontmatter (title, description, canonical). Default true. */
  frontmatter?: boolean
  /** Append JSON-LD from the page as a fenced json block. Default true. */
  jsonLd?: boolean
  /** Send `x-markdown-tokens` / `x-original-tokens`. Default true. */
  tokenHeaders?: boolean
  /** Extra CSS-like tag names to treat as the main content root. */
  contentTags?: string[]
  /** Extra HTML tag names to strip before conversion. */
  stripTags?: string[]
}

export type MarkdownConfig = boolean | MarkdownForAgentsOptions

export type NormalizedMarkdownConfig = {
  enabled: boolean
  mode: MarkdownForAgentsMode
  actions: boolean
  suffix: boolean
  frontmatter: boolean
  jsonLd: boolean
  tokenHeaders: boolean
  contentTags: string[]
  stripTags: string[]
}

const DEFAULT_CONTENT_TAGS = ['main', 'article']
const DEFAULT_STRIP_TAGS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'canvas',
  'nav',
  'header',
  'footer',
]

export function normalizeMarkdownConfig(
  input: MarkdownConfig | undefined
): NormalizedMarkdownConfig {
  if (!input) {
    return {
      enabled: false,
      mode: 'prefer-authored',
      actions: true,
      suffix: false,
      frontmatter: true,
      jsonLd: true,
      tokenHeaders: true,
      contentTags: DEFAULT_CONTENT_TAGS,
      stripTags: DEFAULT_STRIP_TAGS,
    }
  }
  const opts: MarkdownForAgentsOptions =
    input === true ? { enabled: true } : input
  return {
    enabled: opts.enabled !== false,
    mode: opts.mode ?? 'prefer-authored',
    actions: opts.actions !== false,
    suffix: opts.suffix === true,
    frontmatter: opts.frontmatter !== false,
    jsonLd: opts.jsonLd !== false,
    tokenHeaders: opts.tokenHeaders !== false,
    contentTags: unique([...DEFAULT_CONTENT_TAGS, ...(opts.contentTags ?? [])]),
    stripTags: unique([...DEFAULT_STRIP_TAGS, ...(opts.stripTags ?? [])]),
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.toLowerCase()))]
}
