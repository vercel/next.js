import { acceptsMarkdown, appendAcceptVaryHeader } from './accepts-markdown'

describe('acceptsMarkdown', () => {
  it('returns false when no accept header is present', () => {
    expect(acceptsMarkdown(undefined)).toBe(false)
  })

  it('returns true when markdown is the preferred type', () => {
    expect(acceptsMarkdown('text/markdown, text/html;q=0.9, */*;q=0.1')).toBe(
      true
    )
  })

  it('returns false when html is preferred', () => {
    expect(acceptsMarkdown('text/html, text/markdown;q=0.5')).toBe(false)
  })
})

describe('appendAcceptVaryHeader', () => {
  it('appends Accept to an existing vary header', () => {
    expect(appendAcceptVaryHeader('User-Agent')).toBe('User-Agent, Accept')
  })

  it('deduplicates Accept case-insensitively', () => {
    expect(appendAcceptVaryHeader('accept, User-Agent')).toBe(
      'accept, User-Agent'
    )
  })

  it('supports array vary values', () => {
    expect(appendAcceptVaryHeader(['User-Agent', 'Cookie'])).toBe(
      'User-Agent, Cookie, Accept'
    )
  })
})
