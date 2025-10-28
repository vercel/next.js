import { fixMojibake } from './fix-mojibake'

describe('Mojibake handling', () => {
  const validValues = [
    'hello-world',
    'hello world',
    encodeURIComponent('こんにちは'),
  ]
  it.each(validValues)(
    'should maintain value when encoding is correct $1',
    (testValue) => {
      expect(fixMojibake(testValue)).toBe(testValue)
    }
  )

  it('should fix invalid encoding', () => {
    expect(fixMojibake('/blog/ã\x81\x93ã\x82\x93ã\x81«ã\x81¡ã\x81¯')).toBe(
      '/blog/こんにちは'
    )
  })
})
