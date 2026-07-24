import { encodeURIPath } from 'next/dist/shared/lib/encode-uri-path'

const referenceEncodeURIPath = (file: string) =>
  file
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')

describe('encodeURIPath', () => {
  it.each([
    ['', ''],
    ['simple/path.js', 'simple/path.js'],
    ['multiple//slashes/', 'multiple//slashes/'],
    ["AZaz09-_.!~*'()/", "AZaz09-_.!~*'()/"],
    ['space here/file.js', 'space%20here/file.js'],
    ['café/東京/😀', 'caf%C3%A9/%E6%9D%B1%E4%BA%AC/%F0%9F%98%80'],
    ['literal/%2F', 'literal/%252F'],
    ['reserved/?#[]@&=+$,;:', 'reserved/%3F%23%5B%5D%40%26%3D%2B%24%2C%3B%3A'],
  ])('encodes %j as %j', (input, expected) => {
    expect(encodeURIPath(input)).toBe(expected)
  })

  it.each([
    '\u0000/control\ncharacters',
    'already%20encoded/%E6%9D%B1%E4%BA%AC',
    'astral/𐐷/🧑‍💻',
    '/leading/and/trailing/',
  ])('matches segment-by-segment encoding for %j', (input) => {
    expect(encodeURIPath(input)).toBe(referenceEncodeURIPath(input))
  })

  it.each(['\uD800', 'prefix/\uDC00/suffix'])(
    'preserves URI errors for malformed surrogate input %j',
    (input) => {
      expect(() => referenceEncodeURIPath(input)).toThrow(URIError)
      expect(() => encodeURIPath(input)).toThrow(URIError)
    }
  )
})
