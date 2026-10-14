/* eslint-env jest */
import { getSortedRoutes } from 'next/dist/shared/lib/router/utils/sorted-routes'
import type { Route } from 'next/dist/shared/lib/route-types'

describe('getSortedRoutes', () => {
  it('does not add extra routes', () => {
    expect(getSortedRoutes(['/posts'] as Route[])).toEqual(['/posts'])

    expect(getSortedRoutes(['/posts/[id]'] as Route[])).toEqual(['/posts/[id]'])
    expect(getSortedRoutes(['/posts/[id]/foo'] as Route[])).toEqual([
      '/posts/[id]/foo',
    ])

    expect(getSortedRoutes(['/posts/[id]/[foo]/bar'] as Route[])).toEqual([
      '/posts/[id]/[foo]/bar',
    ])
    expect(getSortedRoutes(['/posts/[id]/baz/[foo]/bar'] as Route[])).toEqual([
      '/posts/[id]/baz/[foo]/bar',
    ])
  })

  it('correctly sorts required slugs', () => {
    expect(
      getSortedRoutes([
        '/posts',
        '/[root-slug]',
        '/',
        '/posts/[id]',
        '/blog/[id]/comments/[cid]',
        '/blog/abc/[id]',
        '/[...rest]',
        '/blog/abc/post',
        '/blog/abc',
        '/p1/[[...incl]]',
        '/p/[...rest]',
        '/p2/[...rest]',
        '/p2/[id]',
        '/p2/[id]/abc',
        '/p3/[[...rest]]',
        '/p3/[id]',
        '/p3/[id]/abc',
        '/blog/[id]',
        '/foo/[d]/bar/baz/[f]',
        '/apples/[ab]/[cd]/ef',
      ] as Route[])
    ).toMatchInlineSnapshot(`
      [
        "/",
        "/apples/[ab]/[cd]/ef",
        "/blog/abc",
        "/blog/abc/post",
        "/blog/abc/[id]",
        "/blog/[id]",
        "/blog/[id]/comments/[cid]",
        "/foo/[d]/bar/baz/[f]",
        "/p/[...rest]",
        "/p1/[[...incl]]",
        "/p2/[id]",
        "/p2/[id]/abc",
        "/p2/[...rest]",
        "/p3/[id]",
        "/p3/[id]/abc",
        "/p3/[[...rest]]",
        "/posts",
        "/posts/[id]",
        "/[root-slug]",
        "/[...rest]",
      ]
    `)
  })

  it('catches mismatched param names', () => {
    expect(() =>
      getSortedRoutes([
        '/',
        '/blog',
        '/blog/[id]',
        '/blog/[id]/comments/[cid]',
        '/blog/[cid]',
      ] as Route[])
    ).toThrow(/different slug names/)
  })

  it('catches reused param names', () => {
    expect(() =>
      getSortedRoutes([
        '/',
        '/blog',
        '/blog/[id]/comments/[id]',
        '/blog/[id]',
      ] as Route[])
    ).toThrow(/the same slug name/)
  })

  it('catches reused param names with catch-all', () => {
    expect(() =>
      getSortedRoutes(['/blog/[id]', '/blog/[id]/[...id]'] as Route[])
    ).toThrow(/the same slug name/)
  })

  it('catches middle catch-all with another catch-all', () => {
    expect(() =>
      getSortedRoutes(['/blog/[...id]/[...id2]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Catch-all must be the last part of the URL."`
    )
  })

  it('catches middle catch-all with fixed route', () => {
    expect(() =>
      getSortedRoutes(['/blog/[...id]/abc'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Catch-all must be the last part of the URL."`
    )
  })

  it('catches extra dots in catch-all', () => {
    expect(() =>
      getSortedRoutes(['/blog/[....id]/abc'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start with erroneous periods ('.id')."`
    )
  })

  it('catches missing dots in catch-all', () => {
    expect(() =>
      getSortedRoutes(['/blog/[..id]/abc'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start with erroneous periods ('..id')."`
    )
  })

  it('catches extra brackets for optional', () => {
    expect(() =>
      getSortedRoutes(['/blog/[[...id]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('[...id')."`
    )
    expect(() =>
      getSortedRoutes(['/blog/[[[...id]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('[...id')."`
    )
    expect(() =>
      getSortedRoutes(['/blog/[...id]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('id]')."`
    )
    expect(() =>
      getSortedRoutes(['/blog/[[...id]]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('id]')."`
    )
    expect(() =>
      getSortedRoutes(['/blog/[[[...id]]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('[...id]')."`
    )
  })

  it('disallows optional params', () => {
    expect(() =>
      getSortedRoutes(['/[[blog]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Optional route parameters are not yet supported ("[[blog]]")."`
    )
    expect(() =>
      getSortedRoutes(['/abc/[[blog]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Optional route parameters are not yet supported ("[[blog]]")."`
    )
    expect(() =>
      getSortedRoutes(['/abc/[[blog]]/def'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Optional route parameters are not yet supported ("[[blog]]")."`
    )
  })

  it('disallows mixing required catch all and optional catch all', () => {
    expect(() =>
      getSortedRoutes(['/[...one]', '/[[...one]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot use both an required and optional catch-all route at the same level ("[...one]" and "[[...one]]" )."`
    )
    expect(() =>
      getSortedRoutes(['/[[...one]]', '/[...one]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot use both an optional and required catch-all route at the same level ("[[...one]]" and "[...one]")."`
    )
  })

  it('disallows apex and optional catch all', () => {
    expect(() =>
      getSortedRoutes(['/', '/[[...all]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot define a route with the same specificity as a optional catch-all route ("/" and "/[[...all]]")."`
    )
    expect(() =>
      getSortedRoutes(['/[[...all]]', '/'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot define a route with the same specificity as a optional catch-all route ("/" and "/[[...all]]")."`
    )

    expect(() =>
      getSortedRoutes(['/sub', '/sub/[[...all]]'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot define a route with the same specificity as a optional catch-all route ("/sub" and "/sub[[...all]]")."`
    )
    expect(() =>
      getSortedRoutes(['/sub/[[...all]]', '/sub'] as Route[])
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot define a route with the same specificity as a optional catch-all route ("/sub" and "/sub[[...all]]")."`
    )
  })

  it('catches param names differing only by non-word characters', () => {
    expect(() =>
      getSortedRoutes([
        '/blog/[helloworld]',
        '/blog/[helloworld]/[hello-world]',
      ] as Route[])
    ).toThrow(/differ only by non-word/)
  })

  it('catches param names start with three-dot character not actual three dots', () => {
    expect(() => getSortedRoutes(['[…three-dots]'] as Route[])).toThrow(
      /Detected a three-dot character/
    )
  })
})
