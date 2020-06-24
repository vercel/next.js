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
 * Helper class used to minify CSS classnames
 * down to 1 character each in production builds.
 */
export default class SequentialIDGenerator {
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

// Original: https://github.com/styletron/styletron/blob/master/packages/styletron-engine-atomic/src/sequential-id-generator.js
// Modifications:
//   - single-character id generation
//   - use custom encoding instead of base36
