import {
  doesMiddlewareMatch,
  type MiddlewareSourceConfig,
} from './middleware-testing-utils'

describe('doesMiddlewareMatch', () => {
  it('matches everything when no matcher is provided', () => {
    expect(
      doesMiddlewareMatch({
        config: {
          matcher: undefined,
        },
        url: '/test',
      })
    ).toEqual(true)
  })

  it('matches only valid paths in the config', () => {
    const config = {
      matcher: '/test',
    }
    expect(
      doesMiddlewareMatch({
        config,
        url: '/test',
      })
    ).toEqual(true)
    expect(
      doesMiddlewareMatch({
        config,
        url: '/test?q=1',
      })
    ).toEqual(true)
    expect(
      doesMiddlewareMatch({
        config,
        url: '/other-path',
      })
    ).toEqual(false)
  })

  it('matches regular expressions', () => {
    const config = {
      matcher: ['/test', '/test/(.*)', '/test2/:path+'],
    }
    expect(
      doesMiddlewareMatch({
        config,
        url: '/test',
      })
    ).toEqual(true)
    expect(
      doesMiddlewareMatch({
        config,
        url: '/test/slug',
      })
    ).toEqual(true)
    expect(
      doesMiddlewareMatch({
        config,
        url: '/test2/slug',
      })
    ).toEqual(true)
    expect(
      doesMiddlewareMatch({
        config,
        url: '/test?q=1',
      })
    ).toEqual(true)
  })

  describe('has condition', () => {
    describe('header', () => {
      it('matches only when the header is present', () => {
        const config: MiddlewareSourceConfig = {
          matcher: [
            {
              source: '/test',
              has: [
                {
                  type: 'header',
                  key: 'x-test-header',
                  value: '1',
                },
              ],
            },
          ],
        }
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
          })
        ).toEqual(false)
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
            headers: {
              'x-test-header': '1',
            },
          })
        ).toEqual(true)
      })
    })

    describe('cookies', () => {
      it('matches only when the cookie is present', () => {
        const config: MiddlewareSourceConfig = {
          matcher: [
            {
              source: '/test',
              has: [
                {
                  type: 'cookie',
                  key: 'x-test-cookie',
                  value: '1',
                },
              ],
            },
          ],
        }
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
          })
        ).toEqual(false)
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
            headers: {
              'x-test-header': '1',
            },
          })
        ).toEqual(false)
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
            cookies: {
              'x-test-cookie': '1',
            },
          })
        ).toEqual(true)
      })
    })

    describe('query params', () => {
      it('matches only when the query parameter is present', () => {
        const config: MiddlewareSourceConfig = {
          matcher: [
            {
              source: '/test',
              has: [
                {
                  type: 'query',
                  key: 'q',
                  value: '1',
                },
              ],
            },
          ],
        }
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
          })
        ).toEqual(false)
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test?q=1',
          })
        ).toEqual(true)
      })
    })
  })

  describe('missing condition', () => {
    describe('header', () => {
      it('matches only when the header is missing', () => {
        const config: MiddlewareSourceConfig = {
          matcher: [
            {
              source: '/test',
              missing: [
                {
                  type: 'header',
                  key: 'x-test-header',
                },
              ],
            },
          ],
        }
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
          })
        ).toEqual(true)
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
            headers: {
              'x-test-header': '1',
            },
          })
        ).toEqual(false)
      })
    })

    describe('cookies', () => {
      it('matches only when the cookie is missing', () => {
        const config: MiddlewareSourceConfig = {
          matcher: [
            {
              source: '/test',
              missing: [
                {
                  type: 'cookie',
                  key: 'x-test-cookie',
                },
              ],
            },
          ],
        }
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
          })
        ).toEqual(true)
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
            headers: {
              'x-test-header': '1',
            },
          })
        ).toEqual(true)
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
            cookies: {
              'x-test-cookie': '1',
            },
          })
        ).toEqual(false)
      })
    })

    describe('query params', () => {
      it('matches only when the query parameter is missing', () => {
        const config: MiddlewareSourceConfig = {
          matcher: [
            {
              source: '/test',
              missing: [
                {
                  type: 'query',
                  key: 'q',
                },
              ],
            },
          ],
        }
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test',
          })
        ).toEqual(true)
        expect(
          doesMiddlewareMatch({
            config,
            url: '/test?q=1',
          })
        ).toEqual(false)
      })
    })
  })

  describe('basePath', () => {
    it('correctly picks up basePath from nextConfig', () => {
      const nextConfig = {
        basePath: '/base',
      }
      const config: MiddlewareSourceConfig = {
        matcher: ['/test'],
      }
      expect(
        doesMiddlewareMatch({
          config,
          url: '/test',
          nextConfig,
        })
      ).toEqual(false)
      expect(
        doesMiddlewareMatch({
          config,
          url: '/base/test',
          nextConfig,
        })
      ).toEqual(true)
    })
  })
})
