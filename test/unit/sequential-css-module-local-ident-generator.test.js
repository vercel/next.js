import SequentialCSSModuleLocalIdentGenerator from 'next/dist/build/webpack/config/blocks/css/loaders/helpers/SequentialCSSModuleLocalIdentGenerator'

describe('', () => {
  let generator

  beforeEach(() => {
    generator = new SequentialCSSModuleLocalIdentGenerator()
  })

  it('initializes with default initial props', () => {
    expect(generator.count).toBe(0)
    expect(generator.offset).toBe(10)
    expect(generator.msb).toBe(61)
    expect(generator.power).toBe(1)
  })

  it('avoids classnames starting with digit characters', () => {
    let result = generator.next()

    expect(generator.count).toBe(1)
    expect(generator.offset).toBe(10)
    expect(generator.msb).toBe(61)
    expect(generator.power).toBe(1)
    expect(result).not.toMatch(/^[0-9]$/)

    generator.count = 51
    result = generator.next()

    expect(generator.count).toBe(52)
    expect(generator.offset).toBe(568)
    expect(generator.msb).toBe(3843)
    expect(generator.power).toBe(2)
    expect(result).not.toMatch(/^[0-9].*/)
  })
})
