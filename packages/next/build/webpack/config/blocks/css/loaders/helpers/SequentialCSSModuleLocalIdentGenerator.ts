/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 Ryan Tsao
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal 
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Valid CSS class name's Character set
// https://www.w3.org/TR/CSS21/syndata.html#characters
// ** don't edit array order ** as is optimized for optimal response compression size
// https://github.com/vercel/next.js/pull/14197#discussion_r443669369
const cssCharacterSet = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
]

/**
 * Helper class used to generate minified CSS classnames
 * down to 1 character each in production builds.
 */
export default class SequentialCSSModuleLocalIdentGenerator {
  count: number
  msb: number
  offset: number
  power: number
  prefix: string

  constructor(prefix: string = '') {
    this.count = 0
    this.msb = cssCharacterSet.length - 1
    this.offset = 10
    this.power = 1
    this.prefix = prefix
  }

  next(): string {
    const id = this.encode(this.increment())
    return this.prefix ? this.prefix + id : id
  }

  private increment(): number {
    const id = this.count + this.offset
    if (id === this.msb) {
      this.offset += (this.msb + 1) * 9
      this.msb = Math.pow(cssCharacterSet.length, ++this.power) - 1
    }
    this.count++
    return id
  }

  private encode(n: number): string {
    if (n === 0) {
      return cssCharacterSet[0]
    }

    const b = cssCharacterSet.length
    let s: string[] = []
    while (n > 0) {
      s.push(cssCharacterSet[n % b])
      n = Math.floor(n / b)
    }

    return s.reverse().join('')
  }
}
