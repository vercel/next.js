/* eslint-env jest */
import { parseCookieString } from 'next/dist/server/web/spec-extension/cookies/serialize'

function mapToCookieString(map: Map<string, string>) {
  let s = ''
  for (const [k, v] of map.entries()) {
    s += `${k}=${v};`
  }
  return s
}

describe('parse cookie string', () => {
  it('with a plain value', async () => {
    const input = new Map([['foo', 'bar']])
    const result = parseCookieString(mapToCookieString(input))
    expect(result).toEqual(input)
  })
  it('with multiple `=`', async () => {
    const input = new Map([['foo', 'bar=']])
    const result = parseCookieString(mapToCookieString(input))
    expect(result).toEqual(input)
  })
  it('with multiple plain values', async () => {
    const input = new Map([
      ['foo', 'bar'],
      ['baz', 'qux'],
    ])
    const result = parseCookieString(mapToCookieString(input))
    expect(result).toEqual(input)
  })
  it('with multiple values with `=`', async () => {
    const input = new Map([
      ['foo', 'bar=='],
      ['baz', '=qux'],
    ])
    const result = parseCookieString(mapToCookieString(input))
    expect(result).toEqual(input)
  })
})
