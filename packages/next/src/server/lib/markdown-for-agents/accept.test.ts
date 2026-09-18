import { appendVary, negotiateRepresentation } from './accept'

describe('negotiateRepresentation', () => {
  it('serves HTML when Accept is omitted', () => {
    expect(negotiateRepresentation(undefined, ['html', 'markdown'])).toBe(
      'html'
    )
  })

  it('prefers markdown when it is listed first', () => {
    expect(
      negotiateRepresentation('text/markdown, text/html, */*', [
        'html',
        'markdown',
      ])
    ).toBe('markdown')
  })

  it('prefers HTML for a typical browser Accept', () => {
    expect(
      negotiateRepresentation(
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ['html', 'markdown']
      )
    ).toBe('html')
  })

  it('honors q-values', () => {
    expect(
      negotiateRepresentation('text/html;q=0.1, text/markdown;q=0.9', [
        'html',
        'markdown',
      ])
    ).toBe('markdown')
  })

  it('returns null when HTML is q=0 and markdown is unavailable', () => {
    expect(
      negotiateRepresentation('text/markdown;q=0, text/html;q=0', ['html'])
    ).toBe(null)
  })

  it('selects plain when it is the best match', () => {
    expect(
      negotiateRepresentation('text/plain, text/markdown;q=0.2', [
        'html',
        'markdown',
        'plain',
      ])
    ).toBe('plain')
  })
})

describe('appendVary', () => {
  it('adds Accept once', () => {
    expect(appendVary(undefined, 'Accept')).toBe('Accept')
    expect(appendVary('Accept', 'Accept')).toBe('Accept')
    expect(appendVary('Cookie', 'Accept')).toBe('Cookie, Accept')
  })
})
