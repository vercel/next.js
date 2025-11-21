import { PrefetchRSCPathnameNormalizer } from './prefetch-rsc'

describe('PrefetchRSCPathnameNormalizer', () => {
  const normalizer = new PrefetchRSCPathnameNormalizer()

  it('should match the prefetch rsc pathname', () => {
    expect(normalizer.match('/blog/post.prefetch.rsc')).toBe(true)
  })

  it('should not match the prefetch rsc pathname with a different suffix', () => {
    expect(normalizer.match('/blog/post.prefetch.rsc2')).toBe(false)
  })

  it('should normalize the prefetch rsc pathname', () => {
    expect(normalizer.normalize('/blog/post.prefetch.rsc')).toBe('/blog/post')
  })

  it('should normalize the prefetch rsc index pathname', () => {
    expect(normalizer.normalize('/__index.prefetch.rsc')).toBe('/')
  })
})
