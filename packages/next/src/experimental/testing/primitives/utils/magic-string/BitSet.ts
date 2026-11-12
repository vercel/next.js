export class BitSet {
  declare bits: number[]

  constructor(arg?: BitSet) {
    this.bits = arg instanceof BitSet ? arg.bits.slice() : []
  }

  add(n: number): void {
    this.bits[n >> 5] |= 1 << (n & 31)
  }

  has(n: number): boolean {
    return !!(this.bits[n >> 5] & (1 << (n & 31)))
  }
}
