import { sortFontsVariantValues } from './sort-fonts-variant-values'

describe('sortFontsVariantValues', () => {
  it('should correctly compare and return result for plain integer values', () => {
    // Testing plain integer values
    expect(sortFontsVariantValues('100', '200')).toBe(-100)
    expect(sortFontsVariantValues('200', '100')).toBe(100)
    expect(sortFontsVariantValues('50', '150')).toBe(-100)
    expect(sortFontsVariantValues('150', '50')).toBe(100)
  })

  it('should correctly compare and return result for comma-separated values', () => {
    // Testing "ital,wght" format
    expect(sortFontsVariantValues('1,100', '0,200')).toBe(1)
    expect(sortFontsVariantValues('0,200', '1,100')).toBe(-1)
    expect(sortFontsVariantValues('1,100', '1,200')).toBe(-100)
    expect(sortFontsVariantValues('1,200', '1,100')).toBe(100)
    expect(sortFontsVariantValues('0,100', '0,200')).toBe(-100)
    expect(sortFontsVariantValues('0,200', '0,100')).toBe(100)
  })

  it('should sort an array of plain integer values correctly', () => {
    const unsortedArray = ['100', '1000', '300', '200', '500']
    const sortedArray = unsortedArray.slice().sort(sortFontsVariantValues)

    expect(sortedArray).toEqual(['100', '200', '300', '500', '1000'])
  })

  it('should sort an array of values with comma-separated values correctly', () => {
    const unsortedArray = ['1,100', '1,200', '0,100', '0,200']
    const sortedArray = unsortedArray.slice().sort(sortFontsVariantValues)

    expect(sortedArray).toEqual(['0,100', '0,200', '1,100', '1,200'])
  })
})
