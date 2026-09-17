import { extractFromHtml, htmlBodyToMarkdown } from './html-to-markdown'
import { inferActionsFromHtml } from './actions'
import { composeMarkdownDocument } from './compose'
import { normalizeMarkdownConfig } from './config'
import { transformPageRepresentation } from './transform'

const config = normalizeMarkdownConfig(true)

const page = `<!doctype html>
<html>
  <head>
    <title>Hello</title>
    <meta name="description" content="A demo page">
    <link rel="canonical" href="https://example.com/hello">
    <script type="application/ld+json">{"@type":"WebPage"}</script>
  </head>
  <body>
    <header><nav><a href="/">Home</a></nav></header>
    <main>
      <h1>Hello</h1>
      <p>Welcome to <strong>Next.js</strong>.</p>
      <ul><li>One</li><li>Two</li></ul>
      <form method="post" data-agent-action="subscribe" data-agent-summary="Subscribe to updates">
        <input type="email" name="email" required placeholder="you@example.com">
        <button type="submit">Go</button>
      </form>
    </main>
    <footer>Copyright</footer>
  </body>
</html>`

describe('html to markdown', () => {
  it('strips chrome and keeps main content', () => {
    const extracted = extractFromHtml(page, {
      contentTags: config.contentTags,
      stripTags: config.stripTags,
    })
    expect(extracted.title).toBe('Hello')
    expect(extracted.description).toBe('A demo page')
    expect(extracted.canonical).toBe('https://example.com/hello')
    expect(extracted.jsonLd).toEqual([{ '@type': 'WebPage' }])
    const md = htmlBodyToMarkdown(extracted.bodyHtml)
    expect(md).toContain('# Hello')
    expect(md).toContain('**Next.js**')
    expect(md).toContain('- One')
    expect(md).not.toContain('Home')
    expect(md).not.toContain('Copyright')
  })

  it('infers a usable POST action for the same URL', () => {
    const actions = inferActionsFromHtml(page, '/hello')
    expect(actions).toEqual([
      expect.objectContaining({
        id: 'subscribe',
        method: 'POST',
        href: '/hello',
        fields: [expect.objectContaining({ name: 'email', required: true })],
      }),
    ])
  })

  it('composes frontmatter, body, actions, and JSON-LD', () => {
    const extracted = extractFromHtml(page, {
      contentTags: config.contentTags,
      stripTags: config.stripTags,
    })
    const doc = composeMarkdownDocument(
      {
        title: extracted.title,
        description: extracted.description,
        canonical: extracted.canonical,
        body: htmlBodyToMarkdown(extracted.bodyHtml),
        jsonLd: extracted.jsonLd,
        actions: inferActionsFromHtml(page, '/hello'),
        url: '/hello',
      },
      { frontmatter: true, jsonLd: true, actions: true }
    )
    expect(doc).toMatch(/^---\n/)
    expect(doc).toContain('title: Hello')
    expect(doc).toContain('## Actions')
    expect(doc).toContain('POST /hello')
    expect(doc).toContain('email=ada%40example.com')
    expect(doc).toContain('"@type":"WebPage"')
  })
})

describe('transformPageRepresentation', () => {
  it('returns null for browsers', () => {
    expect(
      transformPageRepresentation({
        accept: 'text/html,application/xhtml+xml',
        html: page,
        url: '/hello',
        config,
        authored: {},
      })
    ).toBeNull()
  })

  it('auto-converts when Accept prefers markdown', () => {
    const result = transformPageRepresentation({
      accept: 'text/markdown',
      html: page,
      url: '/hello',
      config,
      authored: {},
    })
    expect(result?.contentType).toBe('text/markdown; charset=utf-8')
    expect(result?.body).toContain('# Hello')
    expect(result?.body).toContain('## Actions')
  })

  it('prefers authored page.md over auto conversion', () => {
    const result = transformPageRepresentation({
      accept: 'text/markdown',
      html: page,
      url: '/hello',
      config,
      authored: { markdown: '# Authored\n' },
    })
    expect(result?.body).toBe('# Authored\n')
  })

  it('serves authored txt as plain text', () => {
    const result = transformPageRepresentation({
      accept: 'text/plain',
      html: page,
      url: '/hello',
      config,
      authored: { plain: 'just text\n' },
    })
    expect(result?.contentType).toBe('text/plain; charset=utf-8')
    expect(result?.body).toBe('just text\n')
  })

  it('honors a forced suffix representation', () => {
    const result = transformPageRepresentation({
      accept: 'text/html',
      html: page,
      url: '/hello',
      config,
      authored: { markdown: '# File\n' },
      forced: 'markdown',
    })
    expect(result?.body).toBe('# File\n')
  })
})
