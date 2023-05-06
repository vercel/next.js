/* file : base-filter.ts
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

import Hashing from './hashing'
import { getDefaultSeed } from './utils'

/**
 * Exported prng type because it is not from seedrandom
 * Orignal type can be found in: @types/seedrandom
 */
export interface prng {
  (): number
  int32(): number
  quick(): number
}

function randomInt32() {
  if (typeof window === 'undefined' && process.env.NEXT_RUNTIME === 'nodejs') {
    return (require('crypto') as typeof import('crypto'))
      .randomBytes(4)
      .readUInt32BE(0)
  }
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

function seedrandom() {
  return {
    int32: randomInt32,
    quick: randomInt32,
  }
}

/**
 * A base class for implementing probailistic filters
 * @author Thomas Minier
 * @author Arnaud Grall
 */
export default abstract class BaseFilter {
  public _seed: number
  public _rng: prng
  public _hashing: Hashing

  constructor() {
    this._seed = getDefaultSeed()
    this._rng = seedrandom() as prng
    this._hashing = new Hashing()
  }

  /**
   * Get the seed used in this structure
   */
  public get seed(): number {
    return this._seed
  }

  /**
   * Set the seed for this structure
   * @param  seed the new seed that will be used in this structure
   */
  public set seed(seed: number) {
    this._seed = seed
    this._rng = seedrandom() as prng
  }

  /**
   * Get a function used to draw random number
   * @return A factory function used to draw random integer
   */
  public get random(): prng {
    return this._rng
  }

  /**
   * Return a next random seeded int32 integer
   * @returns
   */
  public nextInt32(): number {
    return this._rng.int32()
  }

  /**
   * Save the current structure as a JSON
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public saveAsJSON(): any {
    throw new Error('not-implemented')
  }

  /**
   * Load an Object from a provided JSON object
   * @param json the JSON object to load
   * @return Return the Object loaded from the provided JSON object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  public static fromJSON(json: JSON): any {
    throw new Error(`not-implemented`)
  }
}
