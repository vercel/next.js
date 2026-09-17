import { normalizeMarkdownAgentsConfig } from './config'
import { buildCachedMarkdown } from './cache'

const config = normalizeMarkdownAgentsConfig(true)

describe('buildCachedMarkdown', () => {
  it('returns undefined when the feature is off', () => {
    expect(
      buildCachedMarkdown({
        html: '<main><h1>Hi</h1></main>',
        url: '/hi',
        config: normalizeMarkdownAgentsConfig(false),
        authored: {},
      })
    ).toBeUndefined()
  })

  it('prefers authored page.md', () => {
    expect(
      buildCachedMarkdown({
        html: '<main><h1>Hi</h1></main>',
        url: '/hi',
        config,
        authored: { markdown: '# Authored\n' },
      })
    ).toBe('# Authored\n')
  })

  it('converts HTML when no sibling file exists', () => {
    const body = buildCachedMarkdown({
      html: '<html><body><header><nav>Nav</nav></header><main><h1>Hi</h1></main></body></html>',
      url: '/hi',
      config,
      authored: {},
    })
    expect(body).toContain('# Hi')
    expect(body).not.toContain('Nav')
  })
})
