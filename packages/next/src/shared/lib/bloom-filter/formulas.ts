/* file : formulas.ts
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
 * Various formulas used with Bloom Filters
 * @namespace Formulas
 * @private
 */

/**
 * Compute the optimal size of a Bloom Filter
 * @param  length - The length of the set used to fill the filter
 * @param  errorRate - The targeted false positive rate
 * @return The optimal size of a Bloom Filter
 * @memberof Formulas
 */
export function optimalFilterSize(length: number, errorRate: number): number {
  return Math.ceil(-((length * Math.log(errorRate)) / Math.pow(Math.log(2), 2)))
}

/**
 * Compute the optimal number of hash functions to be used by a Bloom Filter
 * @param  size - The size of the filter
 * @param  length - The length of the set used to fill the filter
 * @return The optimal number of hash functions to be used by a Bloom Filter
 * @memberof Formulas
 */
export function optimalHashes(size: number, length: number): number {
  return Math.ceil((size / length) * Math.log(2))
}
