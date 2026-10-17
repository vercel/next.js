import { parseUrl } from '../../packages/next/src/shared/lib/router/utils/parse-url'
import { DecodeError } from '../../packages/next/src/shared/lib/utils'

describe('parseUrl', () => {
  it('reports an invalid asterisk request target as a DecodeError', () => {
    expect(() => parseUrl('*')).toThrow(DecodeError)
  })

  it('keeps parsing relative and absolute URLs', () => {
    expect(parseUrl('/hello?name=world').query).toEqual({ name: 'world' })
    expect(parseUrl('https://example.com/hello').pathname).toBe('/hello')
  })
})
