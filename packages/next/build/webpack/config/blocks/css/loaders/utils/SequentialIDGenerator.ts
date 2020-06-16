// Utility class used to help us minify CSS classnames
// down to two characters each for production builds.
//
// Original: https://github.com/styletron/styletron/blob/master/packages/styletron-engine-atomic/src/sequential-id-generator.js
// Modifications:
//   - single-character id generation
//   - use base62 instead of base36
import base62 from './base62'

export default class SequentialIDGenerator {
  count: number
  msb: number
  offset: number
  power: number
  prefix: string

  constructor(prefix: string = '') {
    this.count = 0
    this.msb = 61
    this.offset = 10
    this.power = 1
    this.prefix = prefix
  }

  next(): string {
    const id = base62(this.increment())
    return this.prefix ? `${this.prefix}${id}` : id
  }

  increment(): number {
    const id = this.count + this.offset
    if (id === this.msb) {
      this.offset += (this.msb + 1) * 9
      this.msb = Math.pow(62, ++this.power) - 1
    }
    this.count++
    return id
  }
}
