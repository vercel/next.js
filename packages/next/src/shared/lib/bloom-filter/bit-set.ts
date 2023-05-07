import { encode, decode } from './base64-arraybuffer'

const bitsPerWord = 8

/**
 * A memory-efficient Boolean array. Contains just the minimal operations needed for our Bloom filter implementation.
 *
 * @author David Leppik
 */
export default class BitSet {
  public readonly size: number

  // Uint32Array may be slightly faster due to memory alignment, but this avoids endianness when serializing
  public array: Uint8Array

  /**
   * Constructor. All bits are initially set to false.
   * @param size the number of bits that can be stored. (This is NOT required to be a multiple of 8.)
   */
  constructor(size: number) {
    const diff = bitsPerWord - (size % bitsPerWord)
    this.size = size + ([0, 8].includes(diff) ? 0 : diff)
    this.array = new Uint8Array(Math.ceil(this.size / bitsPerWord))
  }

  /**
   * Returns the value of the bit at the given index
   * @param index position of the bit, zero-indexed
   */
  public has(index: number): boolean {
    const wordIndex = Math.floor(index / bitsPerWord)
    const mask = 1 << index % bitsPerWord
    return (this.array[wordIndex] & mask) !== 0
  }

  /**
   * Set the bit to true
   * @param index position of the bit, zero-indexed
   */
  public add(index: number) {
    const wordIndex = Math.floor(index / bitsPerWord)
    const mask = 1 << index % bitsPerWord
    this.array[wordIndex] = this.array[wordIndex] | mask
  }

  /**
   * Returns the maximum true bit.
   */
  public max(): number {
    for (let i = this.array.length - 1; i >= 0; i--) {
      const bits = this.array[i]
      if (bits) {
        return BitSet.highBit(bits) + i * bitsPerWord
      }
    }
    return 0
  }

  /**
   * Returns the number of true bits.
   */
  public bitCount(): number {
    let result = 0
    for (let i = 0; i < this.array.length; i++) {
      result += BitSet.countBits(this.array[i]) // Assumes we never have bits set beyond the end
    }
    return result
  }

  /**
   * Returns true if the size and contents are identical.
   * @param other another BitSet
   */
  public equals(other: BitSet): boolean {
    if (other.size !== this.size) {
      return false
    }
    for (let i = 0; i < this.array.length; i++) {
      if (this.array[i] !== other.array[i]) {
        return false
      }
    }
    return true
  }

  /**
   * Returns a JSON-encodable object readable by {@link import}.
   */
  public export(): { size: number; content: string } {
    return {
      size: this.size,
      content: encode(this.array),
    }
  }

  /**
   * Returns an object written by {@link export}.
   * @param data an object written by {@link export}
   */
  public static import(data: { size: number; content: string }): BitSet {
    if (typeof data.size !== 'number') {
      throw Error('BitSet missing size')
    }
    if (typeof data.content !== 'string') {
      throw Error('BitSet: missing content')
    }
    const result = new BitSet(data.size)
    const buffer = decode(data.content)
    result.array = new Uint8Array(buffer)
    return result
  }

  /**
   * Returns the index of the maximum bit in the number, or -1 for 0
   * @bits an unsigned 8-bit number
   * ```js
   * @example
   * BitSet.highBit(0) // returns -1
   * BitSet.highBit(5) // returns 2
   * ```
   */
  public static highBit(bits: number): number {
    let result = bitsPerWord - 1
    let mask = 1 << result
    while (result >= 0 && (mask & bits) !== mask) {
      mask >>>= 1
      result--
    }
    return result
  }

  /**
   * Returns the number of true bits in the number
   * @bits an unsigned 8-bit number
   * @example
   * ```js
   * BitSet.countBits(0) // returns 0
   * BitSet.countBits(3) // returns 2
   * ```
   */
  public static countBits(bits: number): number {
    let result = bits & 1
    while (bits !== 0) {
      bits = bits >>> 1
      result += bits & 1
    }
    return result
  }
}
