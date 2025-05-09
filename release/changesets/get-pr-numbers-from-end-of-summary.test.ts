import { getPrNumbersFromEndOfSummary } from './get-pr-numbers-from-end-of-summary'

describe('getPrNumbersFromEndOfSummary', () => {
  it('should extract PR numbers at the end of a summary', () => {
    expect(getPrNumbersFromEndOfSummary('... #123, #456')).toEqual([
      '123',
      '456',
    ])
  })

  it('should handle a single PR number', () => {
    expect(getPrNumbersFromEndOfSummary('... #789')).toEqual(['789'])
  })

  it('should return null when no PR numbers are present', () => {
    expect(getPrNumbersFromEndOfSummary('...')).toEqual(null)
  })

  it('should only return the PR numbers that are at the end', () => {
    expect(getPrNumbersFromEndOfSummary('... #123 ... #456')).toEqual(['456'])
  })

  it('should handle multiple PR numbers with different spacing', () => {
    expect(getPrNumbersFromEndOfSummary('... #111,#222, #333,  #444')).toEqual([
      '111',
      '222',
      '333',
      '444',
    ])
  })
})
