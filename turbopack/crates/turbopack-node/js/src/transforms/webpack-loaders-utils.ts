import { createHash as nodeCreateHash } from 'crypto'
import path from 'path'

const WINDOWS_ABS_PATH_REGEXP = /^[a-zA-Z]:[\\/]/

function relativePathToRequest(relativePath: string): string {
  if (relativePath === '') return './.'
  if (relativePath === '..') return '../.'
  if (relativePath.startsWith('../')) return relativePath
  return `./${relativePath}`
}

// Matches webpack's lib/util/identifier.js, including regexp-like requests.
function absoluteToRequest(context: string, request: string): string {
  const windows = WINDOWS_ABS_PATH_REGEXP.test(request)
  if (!windows && request[0] !== '/') return request
  if (!windows && request.length > 1 && request.endsWith('/')) return request

  const queryIndex = request.indexOf('?')
  const resource = queryIndex === -1 ? request : request.slice(0, queryIndex)
  let relative = windows
    ? path.win32.relative(context, resource)
    : path.posix.relative(context, resource)
  if (!windows || !WINDOWS_ABS_PATH_REGEXP.test(relative)) {
    relative = relativePathToRequest(
      windows ? relative.replace(/\\/g, '/') : relative
    )
  }
  return relative + (queryIndex === -1 ? '' : request.slice(queryIndex))
}

export function contextify(context: string, request: string): string {
  return request
    .split('!')
    .map((part) => absoluteToRequest(context, part))
    .join('!')
}

export function absolutify(context: string, request: string): string {
  return request
    .split('!')
    .map((part) =>
      part.startsWith('./') || part.startsWith('../')
        ? path.join(context, part)
        : part
    )
    .join('!')
}

export interface WebpackHash {
  update(data: string | Buffer, inputEncoding?: BufferEncoding): WebpackHash
  digest(encoding?: BufferEncoding): string | Buffer
}

type HashConstructor = new () => WebpackHash

// webpack's wasm hash encodes at most this many characters per memory page.
const MAX_SHORT_STRING = Math.floor((65536 - 64) / 4) & ~3

// webpack batches consecutive unencoded strings before converting to bytes.
// This also preserves surrogate pairs split across update calls.
class BatchedHash implements WebpackHash {
  private string: string | undefined = undefined
  private encoding: BufferEncoding | undefined = undefined

  constructor(private hash: IncrementalHash) {}

  update(data: string | Buffer, inputEncoding?: BufferEncoding) {
    if (this.string !== undefined) {
      if (
        typeof data === 'string' &&
        inputEncoding === this.encoding &&
        this.string.length + data.length < MAX_SHORT_STRING
      ) {
        this.string += data
        return this
      }
      this.flush()
    }
    if (
      typeof data === 'string' &&
      data.length < MAX_SHORT_STRING &&
      (!inputEncoding || !inputEncoding.startsWith('ba'))
    ) {
      this.string = data
      this.encoding = inputEncoding
    } else this.append(data, inputEncoding)
    return this
  }

  private append(data: string | Buffer, encoding?: BufferEncoding) {
    if (typeof data === 'string') {
      do {
        this.hash.update(Buffer.from(data.slice(0, MAX_SHORT_STRING), encoding))
        data = data.slice(MAX_SHORT_STRING)
      } while (data.length > 0)
    } else this.hash.update(data)
  }

  private flush() {
    if (this.string !== undefined) {
      this.append(this.string, this.encoding)
      this.string = undefined
    }
  }

  digest(encoding?: BufferEncoding) {
    this.flush()
    const result = this.hash.digest()
    return encoding && encoding !== 'binary'
      ? result.toString(encoding)
      : result
  }
}

abstract class IncrementalHash {
  protected buffer: Buffer
  protected buffered = 0
  protected length = 0

  constructor(private blockSize: number) {
    this.buffer = Buffer.alloc(blockSize)
  }

  update(input: Buffer) {
    this.length += input.length
    let offset = 0
    if (this.buffered > 0) {
      const take = Math.min(this.blockSize - this.buffered, input.length)
      input.copy(this.buffer, this.buffered, 0, take)
      this.buffered += take
      offset = take
      if (this.buffered < this.blockSize) return
      this.processBlock(this.buffer, 0)
      this.buffered = 0
    }
    const end = input.length - ((input.length - offset) % this.blockSize)
    if (offset < end) this.processBlocks(input, offset, end)
    offset = end
    if (offset < input.length) {
      input.copy(this.buffer, 0, offset)
      this.buffered = input.length - offset
    }
  }

  protected abstract processBlock(input: Buffer, offset: number): void
  protected processBlocks(input: Buffer, offset: number, end: number) {
    for (; offset < end; offset += this.blockSize)
      this.processBlock(input, offset)
  }
  abstract digest(): Buffer
}

// Matches the observable behavior of webpack's BulkUpdateDecorator.
class BulkHash implements WebpackHash {
  private hash: WebpackHash | undefined = undefined
  private buffer = ''

  constructor(private factory: () => WebpackHash) {}

  update(data: string | Buffer, inputEncoding?: BufferEncoding) {
    if (
      inputEncoding !== undefined ||
      typeof data !== 'string' ||
      data.length > 2000
    ) {
      const hash = (this.hash ??= this.factory())
      if (this.buffer.length > 0) {
        hash.update(this.buffer)
        this.buffer = ''
      }
      hash.update(data, inputEncoding)
    } else {
      this.buffer += data
      if (this.buffer.length > 2000) {
        ;(this.hash ??= this.factory()).update(this.buffer)
        this.buffer = ''
      }
    }
    return this
  }

  digest(encoding?: BufferEncoding) {
    const hash = (this.hash ??= this.factory())
    if (this.buffer.length > 0) hash.update(this.buffer)
    const result = hash.digest(encoding)
    return typeof result === 'string' ? result : result.toString()
  }
}

// RFC 1320. Unrolled rounds avoid per-block allocations and round dispatch.
class Md4Hash extends IncrementalHash {
  private a = 0x67452301
  private b = 0xefcdab89 | 0
  private c = 0x98badcfe | 0
  private d = 0x10325476
  private words = new Int32Array(16)

  constructor() {
    super(64)
  }

  protected processBlock(input: Buffer, offset: number) {
    this.processBlocks(input, offset, offset + 64)
  }

  protected processBlocks(input: Buffer, offset: number, end: number) {
    const x = this.words
    let a = this.a | 0,
      b = this.b | 0,
      c = this.c | 0,
      d = this.d | 0
    for (; offset < end; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const wordOffset = offset + i * 4
        x[i] =
          input[wordOffset] |
          (input[wordOffset + 1] << 8) |
          (input[wordOffset + 2] << 16) |
          (input[wordOffset + 3] << 24)
      }
      const previousA = a,
        previousB = b,
        previousC = c,
        previousD = d
      a = (a + ((b & c) | (~b & d)) + x[0]) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + ((a & b) | (~a & c)) + x[1]) | 0
      d = (d << 7) | (d >>> 25)
      c = (c + ((d & a) | (~d & b)) + x[2]) | 0
      c = (c << 11) | (c >>> 21)
      b = (b + ((c & d) | (~c & a)) + x[3]) | 0
      b = (b << 19) | (b >>> 13)
      a = (a + ((b & c) | (~b & d)) + x[4]) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + ((a & b) | (~a & c)) + x[5]) | 0
      d = (d << 7) | (d >>> 25)
      c = (c + ((d & a) | (~d & b)) + x[6]) | 0
      c = (c << 11) | (c >>> 21)
      b = (b + ((c & d) | (~c & a)) + x[7]) | 0
      b = (b << 19) | (b >>> 13)
      a = (a + ((b & c) | (~b & d)) + x[8]) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + ((a & b) | (~a & c)) + x[9]) | 0
      d = (d << 7) | (d >>> 25)
      c = (c + ((d & a) | (~d & b)) + x[10]) | 0
      c = (c << 11) | (c >>> 21)
      b = (b + ((c & d) | (~c & a)) + x[11]) | 0
      b = (b << 19) | (b >>> 13)
      a = (a + ((b & c) | (~b & d)) + x[12]) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + ((a & b) | (~a & c)) + x[13]) | 0
      d = (d << 7) | (d >>> 25)
      c = (c + ((d & a) | (~d & b)) + x[14]) | 0
      c = (c << 11) | (c >>> 21)
      b = (b + ((c & d) | (~c & a)) + x[15]) | 0
      b = (b << 19) | (b >>> 13)
      a = (a + ((b & c) | (b & d) | (c & d)) + x[0] + 0x5a827999) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + ((a & b) | (a & c) | (b & c)) + x[4] + 0x5a827999) | 0
      d = (d << 5) | (d >>> 27)
      c = (c + ((d & a) | (d & b) | (a & b)) + x[8] + 0x5a827999) | 0
      c = (c << 9) | (c >>> 23)
      b = (b + ((c & d) | (c & a) | (d & a)) + x[12] + 0x5a827999) | 0
      b = (b << 13) | (b >>> 19)
      a = (a + ((b & c) | (b & d) | (c & d)) + x[1] + 0x5a827999) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + ((a & b) | (a & c) | (b & c)) + x[5] + 0x5a827999) | 0
      d = (d << 5) | (d >>> 27)
      c = (c + ((d & a) | (d & b) | (a & b)) + x[9] + 0x5a827999) | 0
      c = (c << 9) | (c >>> 23)
      b = (b + ((c & d) | (c & a) | (d & a)) + x[13] + 0x5a827999) | 0
      b = (b << 13) | (b >>> 19)
      a = (a + ((b & c) | (b & d) | (c & d)) + x[2] + 0x5a827999) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + ((a & b) | (a & c) | (b & c)) + x[6] + 0x5a827999) | 0
      d = (d << 5) | (d >>> 27)
      c = (c + ((d & a) | (d & b) | (a & b)) + x[10] + 0x5a827999) | 0
      c = (c << 9) | (c >>> 23)
      b = (b + ((c & d) | (c & a) | (d & a)) + x[14] + 0x5a827999) | 0
      b = (b << 13) | (b >>> 19)
      a = (a + ((b & c) | (b & d) | (c & d)) + x[3] + 0x5a827999) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + ((a & b) | (a & c) | (b & c)) + x[7] + 0x5a827999) | 0
      d = (d << 5) | (d >>> 27)
      c = (c + ((d & a) | (d & b) | (a & b)) + x[11] + 0x5a827999) | 0
      c = (c << 9) | (c >>> 23)
      b = (b + ((c & d) | (c & a) | (d & a)) + x[15] + 0x5a827999) | 0
      b = (b << 13) | (b >>> 19)
      a = (a + (b ^ c ^ d) + x[0] + 0x6ed9eba1) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + (a ^ b ^ c) + x[8] + 0x6ed9eba1) | 0
      d = (d << 9) | (d >>> 23)
      c = (c + (d ^ a ^ b) + x[4] + 0x6ed9eba1) | 0
      c = (c << 11) | (c >>> 21)
      b = (b + (c ^ d ^ a) + x[12] + 0x6ed9eba1) | 0
      b = (b << 15) | (b >>> 17)
      a = (a + (b ^ c ^ d) + x[2] + 0x6ed9eba1) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + (a ^ b ^ c) + x[10] + 0x6ed9eba1) | 0
      d = (d << 9) | (d >>> 23)
      c = (c + (d ^ a ^ b) + x[6] + 0x6ed9eba1) | 0
      c = (c << 11) | (c >>> 21)
      b = (b + (c ^ d ^ a) + x[14] + 0x6ed9eba1) | 0
      b = (b << 15) | (b >>> 17)
      a = (a + (b ^ c ^ d) + x[1] + 0x6ed9eba1) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + (a ^ b ^ c) + x[9] + 0x6ed9eba1) | 0
      d = (d << 9) | (d >>> 23)
      c = (c + (d ^ a ^ b) + x[5] + 0x6ed9eba1) | 0
      c = (c << 11) | (c >>> 21)
      b = (b + (c ^ d ^ a) + x[13] + 0x6ed9eba1) | 0
      b = (b << 15) | (b >>> 17)
      a = (a + (b ^ c ^ d) + x[3] + 0x6ed9eba1) | 0
      a = (a << 3) | (a >>> 29)
      d = (d + (a ^ b ^ c) + x[11] + 0x6ed9eba1) | 0
      d = (d << 9) | (d >>> 23)
      c = (c + (d ^ a ^ b) + x[7] + 0x6ed9eba1) | 0
      c = (c << 11) | (c >>> 21)
      b = (b + (c ^ d ^ a) + x[15] + 0x6ed9eba1) | 0
      b = (b << 15) | (b >>> 17)
      a = (previousA + a) | 0
      b = (previousB + b) | 0
      c = (previousC + c) | 0
      d = (previousD + d) | 0
    }
    this.a = a
    this.b = b
    this.c = c
    this.d = d
  }

  digest() {
    const length = this.length
    this.buffer[this.buffered] = 0x80
    this.buffer.fill(0, this.buffered + 1)
    if (this.buffered >= 56) {
      this.processBlock(this.buffer, 0)
      this.buffer.fill(0)
    }
    this.buffer.writeUInt32LE((length * 8) >>> 0, 56)
    this.buffer.writeUInt32LE(Math.floor(length / 0x20000000), 60)
    this.processBlock(this.buffer, 0)
    const result = Buffer.allocUnsafe(16)
    result.writeInt32LE(this.a, 0)
    result.writeInt32LE(this.b, 4)
    result.writeInt32LE(this.c, 8)
    result.writeInt32LE(this.d, 12)
    return result
  }
}

// Unsigned 64-bit arithmetic using two 32-bit words, without BigInt or per-step
// allocations. Split multiplication into 16-bit limbs to keep carries exact.
class Uint64 {
  low: number
  high: number

  constructor(low = 0, high = 0) {
    this.low = low | 0
    this.high = high | 0
  }

  set(low: number, high: number) {
    this.low = low | 0
    this.high = high | 0
    return this
  }
  add(low: number, high: number) {
    const sum = (this.low >>> 0) + (low >>> 0)
    this.high = (this.high + high + (sum >= 0x100000000 ? 1 : 0)) | 0
    this.low = sum | 0
    return this
  }
  multiply(low: number, high: number) {
    const a = this.low >>> 0,
      b = low >>> 0
    const a0 = a & 65535,
      a1 = a >>> 16,
      b0 = b & 65535,
      b1 = b >>> 16
    const carry = Math.floor((((a0 * b0) >>> 16) + a1 * b0 + a0 * b1) / 65536)
    this.high =
      (Math.imul(this.high, low) +
        Math.imul(this.low, high) +
        a1 * b1 +
        carry) |
      0
    this.low = Math.imul(this.low, low)
    return this
  }
  rotate(bits: number) {
    const low = this.low,
      high = this.high
    this.low = (low << bits) | (high >>> (32 - bits))
    this.high = (high << bits) | (low >>> (32 - bits))
    return this
  }
  xor(low: number, high: number) {
    this.low ^= low
    this.high ^= high
    return this
  }
  xorShift(bits: number) {
    if (bits >= 32) this.low ^= this.high >>> (bits - 32)
    else {
      this.low ^= (this.low >>> bits) | (this.high << (32 - bits))
      this.high ^= this.high >>> bits
    }
    return this
  }
}

const P1L = 0x85ebca87,
  P1H = 0x9e3779b1
const P2L = 0x27d4eb4f,
  P2H = 0xc2b2ae3d
const P3L = 0x9e3779f9,
  P3H = 0x165667b1
const P4L = 0xc2b2ae63,
  P4H = 0x85ebca77
const P5L = 0x165667c5,
  P5H = 0x27d4eb2f

const read32 = (input: Buffer, offset: number) =>
  input[offset] |
  (input[offset + 1] << 8) |
  (input[offset + 2] << 16) |
  (input[offset + 3] << 24)

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1

// High word of an unsigned product by a constant. All intermediates stay below
// 2^53; Math.imul supplies the low word separately.
const multiplyHigh = (a: number, b: number) => {
  const a0 = a & 65535,
    a1 = a >>> 16
  const b0 = b & 65535,
    b1 = b >>> 16
  return (
    (a1 * b1 + Math.floor((((a0 * b0) >>> 16) + a1 * b0 + a0 * b1) / 65536)) | 0
  )
}

class XxHash64Hash extends IncrementalHash {
  private v1 = new Uint64(P1L, P1H).add(P2L, P2H)
  private v2 = new Uint64(P2L, P2H)
  private v3 = new Uint64()
  private v4 = new Uint64().add(~P1L, ~P1H).add(1, 0)
  private lane = new Uint64()
  private result = new Uint64()

  constructor() {
    super(32)
  }

  protected processBlock(input: Buffer, offset: number) {
    this.processBlocks(input, offset, offset + 32)
  }

  protected processBlocks(input: Buffer, offset: number, end: number) {
    const words =
      LITTLE_ENDIAN && (input.byteOffset & 3) === 0 && (offset & 3) === 0
        ? new Int32Array(input.buffer, input.byteOffset, input.length >>> 2)
        : undefined
    let a = this.v1.low | 0,
      ah = this.v1.high | 0
    let b = this.v2.low | 0,
      bh = this.v2.high | 0
    let c = this.v3.low | 0,
      ch = this.v3.high | 0
    let d = this.v4.low | 0,
      dh = this.v4.high | 0
    for (; offset < end; offset += 32) {
      const index = offset >>> 2
      let low = words ? words[index] : read32(input, offset),
        high = words ? words[index + 1] : read32(input, offset + 4)
      high =
        (Math.imul(high, P2L) + Math.imul(low, P2H) + multiplyHigh(low, P2L)) |
        0
      low = Math.imul(low, P2L)
      // Carry-out of a 32-bit sum, kept in integer arithmetic for the JIT.
      let sum = (a + low) | 0
      high = (ah + high + (((low & a) | ((low | a) & ~sum)) >>> 31)) | 0
      low = sum | 0
      let rotated = (low << 31) | (high >>> 1)
      high = (high << 31) | (low >>> 1)
      ah =
        (Math.imul(high, P1L) +
          Math.imul(rotated, P1H) +
          multiplyHigh(rotated, P1L)) |
        0
      a = Math.imul(rotated, P1L)

      low = words ? words[index + 2] : read32(input, offset + 8)
      high = words ? words[index + 3] : read32(input, offset + 12)
      high =
        (Math.imul(high, P2L) + Math.imul(low, P2H) + multiplyHigh(low, P2L)) |
        0
      low = Math.imul(low, P2L)
      sum = (b + low) | 0
      high = (bh + high + (((low & b) | ((low | b) & ~sum)) >>> 31)) | 0
      low = sum | 0
      rotated = (low << 31) | (high >>> 1)
      high = (high << 31) | (low >>> 1)
      bh =
        (Math.imul(high, P1L) +
          Math.imul(rotated, P1H) +
          multiplyHigh(rotated, P1L)) |
        0
      b = Math.imul(rotated, P1L)

      low = words ? words[index + 4] : read32(input, offset + 16)
      high = words ? words[index + 5] : read32(input, offset + 20)
      high =
        (Math.imul(high, P2L) + Math.imul(low, P2H) + multiplyHigh(low, P2L)) |
        0
      low = Math.imul(low, P2L)
      sum = (c + low) | 0
      high = (ch + high + (((low & c) | ((low | c) & ~sum)) >>> 31)) | 0
      low = sum | 0
      rotated = (low << 31) | (high >>> 1)
      high = (high << 31) | (low >>> 1)
      ch =
        (Math.imul(high, P1L) +
          Math.imul(rotated, P1H) +
          multiplyHigh(rotated, P1L)) |
        0
      c = Math.imul(rotated, P1L)

      low = words ? words[index + 6] : read32(input, offset + 24)
      high = words ? words[index + 7] : read32(input, offset + 28)
      high =
        (Math.imul(high, P2L) + Math.imul(low, P2H) + multiplyHigh(low, P2L)) |
        0
      low = Math.imul(low, P2L)
      sum = (d + low) | 0
      high = (dh + high + (((low & d) | ((low | d) & ~sum)) >>> 31)) | 0
      low = sum | 0
      rotated = (low << 31) | (high >>> 1)
      high = (high << 31) | (low >>> 1)
      dh =
        (Math.imul(high, P1L) +
          Math.imul(rotated, P1H) +
          multiplyHigh(rotated, P1L)) |
        0
      d = Math.imul(rotated, P1L)
    }
    this.v1.set(a, ah)
    this.v2.set(b, bh)
    this.v3.set(c, ch)
    this.v4.set(d, dh)
  }

  digest() {
    const hash = this.result
    const lane = this.lane
    if (this.length >= 32) {
      hash.set(this.v1.low, this.v1.high).rotate(1)
      lane.set(this.v2.low, this.v2.high).rotate(7)
      hash.add(lane.low, lane.high)
      lane.set(this.v3.low, this.v3.high).rotate(12)
      hash.add(lane.low, lane.high)
      lane.set(this.v4.low, this.v4.high).rotate(18)
      hash.add(lane.low, lane.high)
      this.merge(hash, this.v1)
      this.merge(hash, this.v2)
      this.merge(hash, this.v3)
      this.merge(hash, this.v4)
    } else hash.set(P5L, P5H)
    hash.add(this.length >>> 0, Math.floor(this.length / 0x100000000))
    let offset = 0
    while (offset + 8 <= this.buffered) {
      lane
        .set(
          this.buffer.readInt32LE(offset),
          this.buffer.readInt32LE(offset + 4)
        )
        .multiply(P2L, P2H)
        .rotate(31)
        .multiply(P1L, P1H)
      hash.xor(lane.low, lane.high).rotate(27).multiply(P1L, P1H).add(P4L, P4H)
      offset += 8
    }
    if (offset + 4 <= this.buffered) {
      lane.set(this.buffer.readInt32LE(offset), 0).multiply(P1L, P1H)
      hash.xor(lane.low, lane.high).rotate(23).multiply(P2L, P2H).add(P3L, P3H)
      offset += 4
    }
    while (offset < this.buffered) {
      lane.set(this.buffer[offset++], 0).multiply(P5L, P5H)
      hash.xor(lane.low, lane.high).rotate(11).multiply(P1L, P1H)
    }
    hash
      .xorShift(33)
      .multiply(P2L, P2H)
      .xorShift(29)
      .multiply(P3L, P3H)
      .xorShift(32)
    const result = Buffer.allocUnsafe(8)
    result.writeUInt32BE(hash.high >>> 0, 0)
    result.writeUInt32BE(hash.low >>> 0, 4)
    return result
  }

  private merge(hash: Uint64, acc: Uint64) {
    const lane = this.lane
    lane.set(acc.low, acc.high).multiply(P2L, P2H).rotate(31).multiply(P1L, P1H)
    hash.xor(lane.low, lane.high).multiply(P1L, P1H).add(P4L, P4H)
  }
}

class DebugHash implements WebpackHash {
  private string = ''

  update(data: string | Buffer) {
    if (typeof data !== 'string') data = data.toString('utf8')
    const prefix = Buffer.from('@webpack-debug-digest@').toString('hex')
    if (data.startsWith(prefix)) {
      data = Buffer.from(data.slice(prefix.length), 'hex').toString()
    }
    this.string += `[${data}](${new Error().stack!.split('\n', 3)[2]})\n`
    return this
  }

  digest() {
    return Buffer.from(`@webpack-debug-digest@${this.string}`).toString('hex')
  }
}

export function createHash(
  algorithm: string | HashConstructor = 'md4'
): WebpackHash {
  if (typeof algorithm === 'function')
    return new BulkHash(() => new algorithm())
  switch (algorithm) {
    case 'md4':
      return new BatchedHash(new Md4Hash())
    case 'xxhash64':
      return new BatchedHash(new XxHash64Hash())
    case 'debug':
      return new DebugHash()
    default:
      return new BulkHash(() =>
        nodeCreateHash(algorithm === 'native-md4' ? 'md4' : algorithm)
      )
  }
}
