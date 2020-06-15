// Utility class used to help us minify CSS classnames
// down to two characters each for production builds.
// https://github.com/styletron/styletron/blob/master/packages/styletron-engine-atomic/src/sequential-id-generator.js
export default class SequentialIDGenerator {
  count: number
  msb: number
  offset: number
  power: number
  prefix: string

  constructor(prefix: string = '') {
    // ensure start with "ae" so "ad" is never produced
    this.count = 0
    this.msb = 35
    this.offset = 10
    this.power = 1
    this.prefix = prefix
  }

  next() {
    const id = this.increment().toString(36)
    return this.prefix ? `${this.prefix}${id}` : id
  }

  increment() {
    const id = this.count + this.offset
    if (id === this.msb) {
      this.offset += (this.msb + 1) * 9
      this.msb = Math.pow(36, ++this.power) - 1
    }
    this.count++
    return id
  }
}
