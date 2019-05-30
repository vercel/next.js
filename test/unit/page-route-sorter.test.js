/* eslint-env jest */
import { getSortedRoutes } from 'next-server/dist/lib/router/utils/sorted-routes'

describe('getSortedRoutes', () => {
  it('does not add extra routes', () => {
    expect(getSortedRoutes(['/posts'])).toEqual(['/posts'])

    expect(getSortedRoutes(['/posts/$id'])).toEqual(['/posts/$id'])
    expect(getSortedRoutes(['/posts/$id/foo'])).toEqual(['/posts/$id/foo'])

    expect(getSortedRoutes(['/posts/$id/$foo/bar'])).toEqual([
      '/posts/$id/$foo/bar'
    ])
    expect(getSortedRoutes(['/posts/$id/baz/$foo/bar'])).toEqual([
      '/posts/$id/baz/$foo/bar'
    ])
  })

  it('correctly sorts required slugs', () => {
    expect(
      getSortedRoutes([
        '/posts',
        '/$root-slug',
        '/',
        '/posts/$id',
        '/blog/$id/comments/$cid',
        '/blog/$id',
        '/foo/$d/bar/baz/$f',
        '/apples/$ab/$cd/ef'
      ])
    ).toMatchSnapshot()
  })
})
