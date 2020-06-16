import SequentialIDGenerator from 'next/dist/build/webpack/config/blocks/css/loaders/utils/SequentialIDGenerator'

describe('', () => {
  let generator

  beforeEach(() => {
    generator = new SequentialIDGenerator()
  })

  it("emits 'A' character in first execution", () => {
    const result = generator.next()
    expect(result).toBe('A')
  })

  it('generates valid CSS identifiers', () => {
    const base = 62
    const offset = 10

    for (let i = 0; i < base - offset; i++) {
      generator.next()
    }

    const result = generator.next()
    expect(result).toBe('A0')
  })
})
