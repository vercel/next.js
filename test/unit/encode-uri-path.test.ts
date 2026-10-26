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

  it.each([
    {
      name: 'multiple unsafe segments',
      input: 'one/two three/four?five/six#seven',
    },
    { name: 'unsafe input below the crossover', input: `${'a'.repeat(62)} ` },
    { name: 'unsafe input at length 127', input: `${'a'.repeat(126)} ` },
    { name: 'unsafe input at length 128', input: `${'a'.repeat(127)} ` },
    { name: 'slash-dense unsafe input', input: `${'a/'.repeat(64)} ` },
    {
      name: 'ASCII escape before non-ASCII input',
      input: `space before unicode/${'a'.repeat(128)}/東京`,
    },
    { name: 'long safe input', input: 'safe/'.repeat(2048) },
  ])('matches the reference for $name', ({ input }) => {
    expect(encodeURIPath(input)).toBe(referenceEncodeURIPath(input))
  })

  it.each([
    { name: 'isolated high surrogate', input: '\uD800' },
    { name: 'isolated low surrogate', input: 'prefix/\uDC00/suffix' },
    {
      name: 'late isolated high surrogate',
      input: `${'safe/'.repeat(256)}\uD800`,
    },
  ])('preserves URI errors for $name', ({ input }) => {
    expect(() => referenceEncodeURIPath(input)).toThrow(URIError)
    expect(() => encodeURIPath(input)).toThrow(URIError)
  })
})
