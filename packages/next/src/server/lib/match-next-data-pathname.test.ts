import { matchNextDataPathname } from './match-next-data-pathname'

describe('matchNextDataPathname', () => {
  it('matches the exact internal route', () => {
    expect(matchNextDataPathname('/_next/data/build-id/index.json')).toEqual({
      path: ['build-id', 'index.json'],
    })
  })

  it.each([
    '/_NEXT/data/build-id/index.json',
    '/_next/DATA/build-id/index.json',
    '/_NeXt/DaTa/build-id/index.json',
  ])('does not match a case variant: %s', (pathname) => {
    expect(matchNextDataPathname(pathname)).toBe(false)
  })
})
