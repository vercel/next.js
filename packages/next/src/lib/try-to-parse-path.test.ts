import { tryToParsePath } from './try-to-parse-path'

describe('tryToParsePath', () => {
  it('parses params in the hash of a url', () => {
    const result = tryToParsePath('/docs/status-codes#:code', {
      handleUrl: true,
    })

    expect(result.error).toBeUndefined()
    expect(result.tokens).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'code' })])
    )
  })

  it('does not treat pattern characters in the hash as modifiers', () => {
    // `?` is an optional modifier in a path, but a plain character in a hash
    const result = tryToParsePath(
      'https://example.com/#/login?return=:slug&mode=(full)',
      { handleUrl: true }
    )

    expect(result.error).toBeUndefined()
    expect(result.tokens).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'slug' })])
    )
  })
})
