import { splitCookiesString } from 'next/dist/server/web/utils'
import cookie, { CookieSerializeOptions } from 'next/dist/compiled/cookie'

function generateCookies(
  ...cookieOptions: (CookieSerializeOptions & { name: string; value: string })[]
) {
  const cookies = cookieOptions.map((opts) =>
    cookie.serialize(opts.name, opts.value, opts)
  )
  return {
    joined: cookies.join(', '),
    expected: cookies,
  }
}

describe('splitCookiesString', () => {
  describe('with a single cookie', () => {
    it('should parse a plain value', () => {
      const { joined, expected } = generateCookies({
        name: 'foo',
        value: 'bar',
      })
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })

    it('should parse expires', () => {
      const { joined, expected } = generateCookies({
        name: 'foo',
        value: 'bar',
        expires: new Date(),
      })
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })

    it('should parse max-age', () => {
      const { joined, expected } = generateCookies({
        name: 'foo',
        value: 'bar',
        maxAge: 10,
      })
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })

    it('should parse path', () => {
      const { joined, expected } = generateCookies({
        name: 'foo',
        value: 'bar',
        path: '/path',
      })
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })

    it('should parse with all the options', () => {
      const { joined, expected } = generateCookies({
        name: 'foo',
        value: 'bar',
        expires: new Date(Date.now() + 10 * 1000),
        maxAge: 10,
        domain: 'https://foo.bar',
        httpOnly: true,
        path: '/path',
        sameSite: 'lax',
        secure: true,
      })
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })
  })

  describe('with a multiple cookies', () => {
    it('should parse a plain value', () => {
      const { joined, expected } = generateCookies(
        {
          name: 'foo',
          value: 'bar',
        },
        {
          name: 'x',
          value: 'y',
        }
      )
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })

    it('should parse expires', () => {
      const { joined, expected } = generateCookies(
        {
          name: 'foo',
          value: 'bar',
          expires: new Date(),
        },
        {
          name: 'x',
          value: 'y',
          expires: new Date(),
        }
      )
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })

    it('should parse max-age', () => {
      const { joined, expected } = generateCookies(
        {
          name: 'foo',
          value: 'bar',
          maxAge: 10,
        },
        {
          name: 'x',
          value: 'y',
          maxAge: 10,
        }
      )
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })

    it('should parse path', () => {
      const { joined, expected } = generateCookies(
        {
          name: 'foo',
          value: 'bar',
          path: '/path',
        },
        {
          name: 'x',
          value: 'y',
          path: '/path',
        }
      )
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })

    it('should parse with all the options', () => {
      const { joined, expected } = generateCookies(
        {
          name: 'foo',
          value: 'bar',
          expires: new Date(Date.now() + 10 * 1000),
          maxAge: 10,
          domain: 'https://foo.bar',
          httpOnly: true,
          path: '/path',
          sameSite: 'lax',
          secure: true,
        },
        {
          name: 'x',
          value: 'y',
          expires: new Date(Date.now() + 20 * 1000),
          maxAge: 20,
          domain: 'https://x.y',
          httpOnly: true,
          path: '/path',
          sameSite: 'strict',
          secure: true,
        }
      )
      const result = splitCookiesString(joined)
      expect(result).toEqual(expected)
    })
  })
})
