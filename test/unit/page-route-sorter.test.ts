/* eslint-env jest */
import { getSortedRoutes } from 'next/dist/shared/lib/router/utils/sorted-routes'
import { createRoutes } from 'next/dist/shared/lib/route-types'

describe('getSortedRoutes', () => {
  it('does not add extra routes', () => {
    expect(getSortedRoutes(createRoutes(['/posts']))).toEqual(['/posts'])

    expect(getSortedRoutes(createRoutes(['/posts/[id]']))).toEqual([
      '/posts/[id]',
    ])
    expect(getSortedRoutes(createRoutes(['/posts/[id]/foo']))).toEqual([
      '/posts/[id]/foo',
    ])

    expect(getSortedRoutes(createRoutes(['/posts/[id]/[foo]/bar']))).toEqual([
      '/posts/[id]/[foo]/bar',
    ])
    expect(
      getSortedRoutes(createRoutes(['/posts/[id]/baz/[foo]/bar']))
    ).toEqual(['/posts/[id]/baz/[foo]/bar'])
  })

  it('correctly sorts required slugs', () => {
    expect(
      getSortedRoutes(
        createRoutes([
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
        ])
      )
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
      getSortedRoutes(
        createRoutes([
          '/',
          '/blog',
          '/blog/[id]',
          '/blog/[id]/comments/[cid]',
          '/blog/[cid]',
        ])
      )
    ).toThrow(/different slug names/)
  })

  it('catches reused param names', () => {
    expect(() =>
      getSortedRoutes(
        createRoutes(['/', '/blog', '/blog/[id]/comments/[id]', '/blog/[id]'])
      )
    ).toThrow(/the same slug name/)
  })

  it('catches reused param names with catch-all', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[id]', '/blog/[id]/[...id]']))
    ).toThrow(/the same slug name/)
  })

  it('catches middle catch-all with another catch-all', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[...id]/[...id2]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Catch-all must be the last part of the URL."`
    )
  })

  it('catches middle catch-all with fixed route', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[...id]/abc']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Catch-all must be the last part of the URL."`
    )
  })

  it('catches extra dots in catch-all', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[....id]/abc']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start with erroneous periods ('.id')."`
    )
  })

  it('catches missing dots in catch-all', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[..id]/abc']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start with erroneous periods ('..id')."`
    )
  })

  it('catches extra brackets for optional', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[[...id]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('[...id')."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[[[...id]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('[...id')."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[...id]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('id]')."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[[...id]]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('id]')."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/blog/[[[...id]]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Segment names may not start or end with extra brackets ('[...id]')."`
    )
  })

  it('disallows optional params', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/[[blog]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Optional route parameters are not yet supported ("[[blog]]")."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/abc/[[blog]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Optional route parameters are not yet supported ("[[blog]]")."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/abc/[[blog]]/def']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"Optional route parameters are not yet supported ("[[blog]]")."`
    )
  })

  it('disallows mixing required catch all and optional catch all', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/[...one]', '/[[...one]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot use both an required and optional catch-all route at the same level ("[...one]" and "[[...one]]" )."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/[[...one]]', '/[...one]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot use both an optional and required catch-all route at the same level ("[[...one]]" and "[...one]")."`
    )
  })

  it('disallows apex and optional catch all', () => {
    expect(() =>
      getSortedRoutes(createRoutes(['/', '/[[...all]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot define a route with the same specificity as a optional catch-all route ("/" and "/[[...all]]")."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/[[...all]]', '/']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot define a route with the same specificity as a optional catch-all route ("/" and "/[[...all]]")."`
    )

    expect(() =>
      getSortedRoutes(createRoutes(['/sub', '/sub/[[...all]]']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot define a route with the same specificity as a optional catch-all route ("/sub" and "/sub[[...all]]")."`
    )
    expect(() =>
      getSortedRoutes(createRoutes(['/sub/[[...all]]', '/sub']))
    ).toThrowErrorMatchingInlineSnapshot(
      `"You cannot define a route with the same specificity as a optional catch-all route ("/sub" and "/sub[[...all]]")."`
    )
  })

  it('catches param names differing only by non-word characters', () => {
    expect(() =>
      getSortedRoutes(
        createRoutes(['/blog/[helloworld]', '/blog/[helloworld]/[hello-world]'])
      )
    ).toThrow(/differ only by non-word/)
  })

  it('catches param names start with three-dot character not actual three dots', () => {
    expect(() => getSortedRoutes(createRoutes(['[…three-dots]']))).toThrow(
      /Detected a three-dot character/
    )
  })
})
