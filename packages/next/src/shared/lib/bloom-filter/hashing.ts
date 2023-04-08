import fnv1a from '../fnv1a'
import { getDefaultSeed, numberToHex } from './utils'

/**
 * @typedef {TwoHashes} Two hashes of the same value, as computed by {@link hashTwice}.
 * @property {number} first - The result of the first hashing function applied to a value
 * @property {number} second - The result of the second hashing function applied to a value
 * @memberof Utils
 */
export interface TwoHashes {
  first: number
  second: number
}

/**
 * Templated TwoHashes type
 */
export interface TwoHashesTemplated<T> {
  first: T
  second: T
}

/**
 * TwoHashes type in number and int format
 */
export interface TwoHashesIntAndString {
  int: TwoHashesTemplated<number>
  string: TwoHashesTemplated<string>
}

/**
 * Data type of an hashable value, must be string, ArrayBuffer or Buffer.
 */
export type HashableInput = string

export default class Hashing implements Hashing {
  /**
   * Apply enhanced Double Hashing to produce a n-hash
   * @see {@link http://peterd.org/pcd-diss.pdf} s6.5.4
   * @param  n - The indice of the hash function we want to produce
   * @param  hashA - The result of the first hash function applied to a value.
   * @param  hashB - The result of the second hash function applied to a value.
   * @param  size - The size of the datastructures associated to the hash context (ex: the size of a Bloom Filter)
   * @return The result of hash_n applied to a value.
   * @memberof Hashing
   * @author Thomas Minier
   * @author Arnaud Grall
   */
  public doubleHashing(
    n: number,
    hashA: number,
    hashB: number,
    size: number
  ): number {
    return Math.abs((hashA + n * hashB + Math.floor((n ** 3 - n) / 6)) % size)
  }

  /**
   * Generate a set of distinct indexes on interval [0, size) using the double hashing technique
   * For generating efficiently distinct indexes we re-hash after detecting a cycle by changing slightly the seed.
   * It has the effect of generating faster distinct indexes without loosing entirely the utility of the double hashing.
   * For small number of indexes it will work perfectly. For a number close to the size, and size very large
   * Advise: do not generate `size` indexes for a large interval. In practice, size should be equal
   * to the number of hash functions used and is often low.
   *
   * @param  element  - The element to hash
   * @param  size     - the range on which we can generate an index [0, size) = size
   * @param  number   - The number of indexes desired
   * @param  seed     - The seed used
   * @return Array<number>
   * @author Arnaud Grall
   * @author Simon Woolf (SimonWoolf)
   */
  public getDistinctIndexes(
    element: HashableInput,
    size: number,
    number: number,
    seed?: number
  ): Array<number> {
    if (seed === undefined) {
      seed = getDefaultSeed()
    }
    let n = 0
    const indexes: Set<number> = new Set()
    let hashes = this.hashTwice(element, seed)
    // let cycle = 0
    while (indexes.size < number) {
      const ind = hashes.first % size
      if (!indexes.has(ind)) {
        indexes.add(ind)
      }
      hashes.first = (hashes.first + hashes.second) % size
      hashes.second = (hashes.second + n) % size
      n++

      if (n > size) {
        // Enhanced double hashing stops cycles of length less than `size` in the case where
        // size is coprime with the second hash. But you still get cycles of length `size`.
        // So if we reach there and haven't finished, append a prime to the input and
        // rehash.
        seed++
        hashes = this.hashTwice(element, seed)
      }
    }
    return [...indexes.values()]
  }

  /**
   * Generate N indexes on range [0, size)
   * It uses the double hashing technique to generate the indexes.
   * It hash twice the value only once before generating the indexes.
   * Warning: you can have a lot of modulo collisions.
   * @param  element    - The element to hash
   * @param  size       - The range on which we can generate the index, exclusive
   * @param  hashCount  - The number of indexes we want
   * @return An array of indexes on range [0, size)
   */
  public getIndexes(
    element: HashableInput,
    size: number,
    hashCount: number,
    seed?: number
  ): Array<number> {
    if (seed === undefined) {
      seed = getDefaultSeed()
    }
    const arr = []
    const hashes = this.hashTwice(element, seed)
    for (let i = 0; i < hashCount; i++) {
      arr.push(this.doubleHashing(i, hashes.first, hashes.second, size))
    }
    return arr
  }

  /**
   * @internal
   * Hash an element of type {@link HashableInput} into {@link Number}
   * Can be overrided as long as you return a value of type {@link Number}
   * Don't forget to use the seed when hashing, otherwise if some kind of randomness is in the process
   * you may have inconsistent behaviors between 2 runs.
   * @param element
   * @param seed
   * @returns A 64bits floating point {@link Number}
   */
  public serialize(element: HashableInput, seed?: number) {
    if (!seed) {
      seed = getDefaultSeed()
    }
    return Number(fnv1a(element, { seed }))
  }

  /**
   * (64-bits only) Hash a value into two values (in hex or integer format)
   * @param  value - The value to hash
   * @param  asInt - (optional) If True, the values will be returned as an integer. Otherwise, as hexadecimal values.
   * @param seed the seed used for hashing
   * @return The results of the hash functions applied to the value (in hex or integer)
   * @author Arnaud Grall & Thomas Minier
   */
  public hashTwice(value: HashableInput, seed?: number): TwoHashes {
    if (seed === undefined) {
      seed = getDefaultSeed()
    }
    return {
      first: this.serialize(value, seed + 1),
      second: this.serialize(value, seed + 2),
    }
  }

  /**
   * Hash twice an element into their HEX string representations
   * @param value
   * @param seed
   * @returns TwoHashesTemplated<string>
   */
  public hashTwiceAsString(
    value: HashableInput,
    seed?: number
  ): TwoHashesTemplated<string> {
    const { first, second } = this.hashTwice(value, seed)
    return {
      first: numberToHex(first),
      second: numberToHex(second),
    }
  }

  /**
   * (64-bits only) Same as hashTwice but return Numbers and String equivalent
   * @param  val the value to hash
   * @param  seed the seed to change when hashing
   * @return TwoHashesIntAndString
   * @author Arnaud Grall
   */
  public hashTwiceIntAndString(
    val: HashableInput,
    seed?: number
  ): TwoHashesIntAndString {
    if (seed === undefined) {
      seed = getDefaultSeed()
    }
    const one = this.hashIntAndString(val, seed + 1)
    const two = this.hashIntAndString(val, seed + 2)
    return {
      int: {
        first: one.int,
        second: two.int,
      },
      string: {
        first: one.string,
        second: two.string,
      },
    }
  }

  /**
   * Hash an item as an unsigned int
   * @param  elem - Element to hash
   * @param  seed - The hash seed. If its is UINT32 make sure to set the length to 32
   * @param  length - The length of hashes (defaults to 32 bits)
   * @return The hash value as an unsigned int
   * @author Arnaud Grall
   */
  public hashAsInt(elem: HashableInput, seed?: number): number {
    if (seed === undefined) {
      seed = getDefaultSeed()
    }
    return this.serialize(elem, seed)
  }

  /**
   * Hash an item and return its number and HEX string representation
   * @param  elem - Element to hash
   * @param  seed - The hash seed. If its is UINT32 make sure to set the length to 32
   * @param  base - The base in which the string will be returned, default: 16
   * @param  length - The length of hashes (defaults to 32 bits)
   * @return The item hased as an int and a string
   * @author Arnaud Grall
   */
  public hashIntAndString(elem: HashableInput, seed?: number) {
    const hash = this.hashAsInt(elem, seed)
    return { int: hash, string: numberToHex(hash) }
  }
}
