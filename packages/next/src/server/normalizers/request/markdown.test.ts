import { MarkdownPathnameNormalizer } from './markdown'

describe('MarkdownPathnameNormalizer', () => {
  const normalizer = new MarkdownPathnameNormalizer()

  it('maps /about.md to /about as markdown', () => {
    expect(normalizer.extract('/about.md')).toEqual({
      pathname: '/about',
      representation: 'markdown',
    })
  })

  it('maps /about.txt to /about as plain', () => {
    expect(normalizer.extract('/about.txt')).toEqual({
      pathname: '/about',
      representation: 'plain',
    })
  })

  it('does not treat MDX as markdown', () => {
    expect(normalizer.extract('/about.mdx')).toBeNull()
  })

  it('maps /index.md to the root page', () => {
    expect(normalizer.extract('/index.md')).toEqual({
      pathname: '/',
      representation: 'markdown',
    })
  })
})
