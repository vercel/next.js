// segments produced by Mappings always carry source info, unlike the wider SourceMapSegment
export type FullSegment =
  | [number, number, number, number]
  | [number, number, number, number, number]

// max decoded segments buffered before the encoder drains them into the VLQ string
export const SEGMENTS_PER_FLUSH = 4096

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const intToChar = /* #__PURE__ */ (() => {
  const chars = new Uint8Array(64)
  for (let i = 0; i < 64; i++) chars[i] = BASE64_CHARS.charCodeAt(i)
  return chars
})()

const COMMA = 44
const SEMICOLON = 59
const BUFFER_SIZE = 16384
// worst case bytes for one segment: 5 fields x 7 VLQ chars, plus a separator
const FLUSH_THRESHOLD = BUFFER_SIZE - 36

// shared scratch buffer: an encoder only touches it inside synchronous drain/flush
// calls and flushes it before drain returns, so no bytes are left in it between
// calls for another encoder to overwrite (Bundle#generateMap can run one inside an
// includeContent callback while its own mappings are still being encoded)
const scratch = /* #__PURE__ */ new Uint8Array(BUFFER_SIZE)

function writeVlq(pos: number, num: number): number {
  num = num < 0 ? (-num << 1) | 1 : num << 1
  do {
    let clamped = num & 0b011111
    num >>>= 5
    if (num > 0) clamped |= 0b100000
    scratch[pos++] = intToChar[clamped]
  } while (num > 0)
  return pos
}

const decoder = /* #__PURE__ */ new TextDecoder()

// Buffers completed lines of segments and VLQ-encodes them in batches, so producing
// an encoded map never holds more than ~SEGMENTS_PER_FLUSH decoded segments
export class MappingsEncoder {
  declare private out: string
  declare private pos: number
  declare private lines: FullSegment[][]
  declare private buffered: number
  declare private needsComma: boolean
  declare private prevGenColumn: number
  declare private prevSourceIndex: number
  declare private prevSourceLine: number
  declare private prevSourceColumn: number
  declare private prevNameIndex: number

  constructor() {
    this.out = ''
    this.pos = 0
    this.lines = []
    this.buffered = 0
    this.needsComma = false
    this.prevGenColumn = 0
    this.prevSourceIndex = 0
    this.prevSourceLine = 0
    this.prevSourceColumn = 0
    this.prevNameIndex = 0
  }

  endLine(segments: FullSegment[]): void {
    this.lines.push(segments)
    // count the line itself too, so content dominated by line breaks also drains
    this.buffered += segments.length + 1
    if (this.buffered >= SEGMENTS_PER_FLUSH) this.drain(null)
  }

  segments(segments: FullSegment[]): void {
    this.drain(segments)
  }

  finish(segments: FullSegment[]): string {
    this.drain(segments)
    this.flush()
    return this.out
  }

  private drain(trailing: FullSegment[] | null): void {
    const lines = this.lines
    const lineCount = lines.length

    for (let l = 0; l <= lineCount; l++) {
      const line = l < lineCount ? lines[l] : trailing
      if (line === null) break

      for (let i = 0; i < line.length; i++) {
        if (this.pos > FLUSH_THRESHOLD) this.flush()
        const segment = line[i]
        if (this.needsComma) scratch[this.pos++] = COMMA
        this.needsComma = true
        this.pos = writeVlq(this.pos, segment[0] - this.prevGenColumn)
        this.prevGenColumn = segment[0]
        this.pos = writeVlq(this.pos, segment[1] - this.prevSourceIndex)
        this.prevSourceIndex = segment[1]
        this.pos = writeVlq(this.pos, segment[2] - this.prevSourceLine)
        this.prevSourceLine = segment[2]
        this.pos = writeVlq(this.pos, segment[3] - this.prevSourceColumn)
        this.prevSourceColumn = segment[3]
        if (segment.length === 5) {
          this.pos = writeVlq(this.pos, segment[4] - this.prevNameIndex)
          this.prevNameIndex = segment[4]
        }
      }

      if (l < lineCount) {
        if (this.pos > FLUSH_THRESHOLD) this.flush()
        scratch[this.pos++] = SEMICOLON
        this.needsComma = false
        this.prevGenColumn = 0
      }
    }
    lines.length = 0
    this.buffered = 0
    this.flush()
  }

  private flush(): void {
    this.out += decoder.decode(scratch.subarray(0, this.pos))
    this.pos = 0
  }
}
