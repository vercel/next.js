/* file : utils.ts
MIT License

Copyright (c) 2017-2020 Thomas Minier & Arnaud Grall

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Utilitaries functions
 * @namespace Utils
 * @private
 */

/* JSDOC typedef */
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
export type HashableInput = string | ArrayBuffer | Buffer

/**
 * BufferError
 */
export const BufferError =
  'The buffer class must be available, if you are a browser user use the buffer package (https://www.npmjs.com/package/buffer)'

/**
 * Create a new array fill with a base value
 * @param size - The size of the array
 * @param defaultValue - The default value used to fill the array. If it's a function, it will be invoked to get the default value.
 * @return A newly allocated array
 * @memberof Utils
 */
export function allocateArray<T>(
  size: number,
  defaultValue: T | (() => T)
): Array<T> {
  const array: Array<T> = new Array<T>(size)
  const getDefault =
    typeof defaultValue === 'function'
      ? (defaultValue as () => T)
      : () => defaultValue
  for (let ind = 0; ind < size; ind++) {
    array[ind] = getDefault()
  }
  return array
}

/**
 * Return a number to its Hex format by padding zeroes if length mod 4 != 0
 * @param elem the element to transform in HEX
 * @returns the HEX number padded of zeroes
 */
export function numberToHex(elem: number): string {
  let e = Number(elem).toString(16)
  if (e.length % 4 !== 0) {
    e = '0'.repeat(4 - (e.length % 4)) + e
  }
  return e
}

/**
 * Generate a random int between two bounds (included)
 * @param min - The lower bound
 * @param max - The upper bound
 * @param random - Function used to generate random floats
 * @return A random int bewteen lower and upper bound (included)
 * @memberof Utils
 * @author Thomas Minier
 */
export function randomInt(
  min: number,
  max: number,
  random?: () => number
): number {
  if (random === undefined) {
    random = Math.random
  }
  min = Math.ceil(min)
  max = Math.floor(max)
  const rn = random()
  return Math.floor(rn * (max - min + 1)) + min
}

/**
 * Return the non-destructive XOR of two buffers
 * @param a - The buffer to copy, then to xor with b
 * @param b - The buffer to xor with
 * @return The results of the XOR between the two buffers
 * @author Arnaud Grall
 */
export function xorBuffer(a: Buffer, b: Buffer): Buffer {
  const length = Math.max(a.length, b.length)
  const buffer = Buffer.allocUnsafe(length).fill(0)
  for (let i = 0; i < length; ++i) {
    if (i < a.length && i < b.length) {
      buffer[length - i - 1] = a[a.length - i - 1] ^ b[b.length - i - 1]
    } else if (i < a.length && i >= b.length) {
      buffer[length - i - 1] ^= a[a.length - i - 1]
    } else if (i < b.length && i >= a.length) {
      buffer[length - i - 1] ^= b[b.length - i - 1]
    }
  }
  // now need to remove leading zeros in the buffer if any
  let start = 0
  const it = buffer.values()
  let value = it.next()
  while (!value.done && value.value === 0) {
    start++
    value = it.next()
  }
  return buffer.slice(start)
}

/**
 * Return true if the buffer is empty, i.e., all value are equals to 0.
 * @param  buffer - The buffer to inspect
 * @return True if the buffer only contains zero, False otherwise
 * @author Arnaud Grall
 */
export function isEmptyBuffer(buffer: Buffer | null): boolean {
  if (buffer === null || !buffer) return true
  for (const value of buffer) {
    if (value !== 0) {
      return false
    }
  }
  return true
}

/**
 * Return the default seed used in the package
 * @return A seed as a floating point number
 * @author Arnaud Grall
 */
export function getDefaultSeed(): number {
  return 0x1234567890
}
