import {
  indexOfUint8Array,
  isEquivalentUint8Arrays,
  removeFromUint8Array,
} from 'next/dist/server/stream-utils/uint8array-helpers'

describe('uint8array-helpers', () => {
  it('finds the start index of a nested sequence', () => {
    const haystack = new Uint8Array([1, 2, 3, 4, 5, 6])
    const needle = new Uint8Array([3, 4, 5])
    expect(indexOfUint8Array(haystack, needle)).toBe(2)
  })

  it('handles Buffer input as Uint8Array', () => {
    const haystack = Buffer.from([9, 8, 7, 6, 5, 4])
    const needle = new Uint8Array([7, 6])
    expect(indexOfUint8Array(haystack, needle)).toBe(2)
  })

  it('returns -1 when not found', () => {
    const haystack = new Uint8Array([1, 2, 3, 4])
    const needle = new Uint8Array([4, 5])
    expect(indexOfUint8Array(haystack, needle)).toBe(-1)
  })

  it('removes a matching sequence from the middle', () => {
    const haystack = new Uint8Array([10, 20, 30, 40, 50])
    const needle = new Uint8Array([30, 40])

    const result = removeFromUint8Array(haystack, needle)

    expect(isEquivalentUint8Arrays(result, new Uint8Array([10, 20, 50]))).toBe(
      true
    )
  })

  it('returns original reference when no match exists', () => {
    const haystack = new Uint8Array([1, 2, 3])
    const needle = new Uint8Array([4, 5])
    expect(removeFromUint8Array(haystack, needle)).toBe(haystack)
  })
})
