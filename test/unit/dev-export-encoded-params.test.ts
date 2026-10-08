/* eslint-env jest */

describe('dev server export encoded params matching', () => {
  function matchPrerenderedRoute(
    prerenderedRoutes: Array<{ pathname: string; encodedPathname: string }>,
    urlPathname: string
  ): boolean {
    let decodedUrlPathname: string | undefined
    try {
      decodedUrlPathname = decodeURI(urlPathname)
    } catch {}

    return prerenderedRoutes.some(
      (item) =>
        item.pathname === urlPathname ||
        item.encodedPathname === urlPathname ||
        (decodedUrlPathname !== undefined &&
          (item.pathname === decodedUrlPathname ||
            item.encodedPathname === decodedUrlPathname))
    )
  }

  const prerenderedRoutes = [
    {
      pathname: '/sticks & stones',
      encodedPathname: '/sticks%20%26%20stones',
    },
    {
      pathname: '/posts/hello world',
      encodedPathname: '/posts/hello%20world',
    },
    {
      pathname: '/tags/c++',
      encodedPathname: '/tags/c%2B%2B',
    },
  ]

  it('matches when urlPathname is already encoded', () => {
    expect(
      matchPrerenderedRoute(prerenderedRoutes, '/sticks%20%26%20stones')
    ).toBe(true)
    expect(
      matchPrerenderedRoute(prerenderedRoutes, '/posts/hello%20world')
    ).toBe(true)
    expect(matchPrerenderedRoute(prerenderedRoutes, '/tags/c%2B%2B')).toBe(true)
  })

  it('matches when urlPathname is decoded', () => {
    expect(matchPrerenderedRoute(prerenderedRoutes, '/sticks & stones')).toBe(
      true
    )
    expect(matchPrerenderedRoute(prerenderedRoutes, '/posts/hello world')).toBe(
      true
    )
    expect(matchPrerenderedRoute(prerenderedRoutes, '/tags/c++')).toBe(true)
  })

  it('does not match routes that are genuinely missing', () => {
    expect(matchPrerenderedRoute(prerenderedRoutes, '/sticks')).toBe(false)
    expect(matchPrerenderedRoute(prerenderedRoutes, '/posts/missing')).toBe(
      false
    )
    expect(matchPrerenderedRoute(prerenderedRoutes, '/tags/c%23')).toBe(false)
  })

  it('gracefully handles malformed URI components without throwing', () => {
    expect(matchPrerenderedRoute(prerenderedRoutes, '/malformed%FF')).toBe(
      false
    )
  })
})
