const CHUNKS_DICTIONARY_PREFIX = '__next_chunks_dict__:'

// Flight's length-delimited binary row tags. Text rows end in a newline, but
// binary rows can contain arbitrary bytes (including newlines), so the decoder
// must frame them before inspecting import rows.
const BINARY_ROW_TAGS = new Set([
  84, // T
  65, // A
  79, // O
  111, // o
  98, // b
  85, // U
  83, // S
  115, // s
  76, // L
  108, // l
  71, // G
  103, // g
  77, // M
  109, // m
  86, // V
])

type ChunksDictionary = Record<string, string[]>

const enum RowState {
  Id,
  Tag,
  Length,
  Text,
  Binary,
}

/**
 * Expands dictionary references in Flight import rows while preserving binary
 * rows byte-for-byte. A decoder instance is scoped to one Flight response so
 * dictionary ids from concurrent responses cannot collide.
 */
export class FlightChunkListDecoder {
  private readonly dictionary: ChunksDictionary
  private readonly textDecoder = new TextDecoder()
  private readonly textEncoder = new TextEncoder()
  private rowState = RowState.Id
  private rowBuffer: number[] = []
  private rowLength = 0
  private binaryBytesRemaining = 0
  private atStart = true

  constructor(initialDictionary?: ChunksDictionary) {
    this.dictionary = { ...initialDictionary }
  }

  transform(chunk: Uint8Array): Uint8Array[] {
    const output: Uint8Array[] = []
    let offset = 0

    // Cache Components may prepend a completeness marker. It is outside the
    // Flight row framing and must pass through untouched.
    if (this.atStart && chunk.byteLength > 0) {
      this.atStart = false
      if (chunk[0] === 0x23 || chunk[0] === 0x7e) {
        output.push(chunk.subarray(0, 1))
        offset = 1
      }
    }

    while (offset < chunk.byteLength) {
      switch (this.rowState) {
        case RowState.Id: {
          const byte = chunk[offset++]
          this.rowBuffer.push(byte)
          if (byte === 58) {
            this.rowState = RowState.Tag
          }
          break
        }
        case RowState.Tag: {
          const byte = chunk[offset++]
          this.rowBuffer.push(byte)
          if (BINARY_ROW_TAGS.has(byte)) {
            this.rowLength = 0
            this.rowState = RowState.Length
          } else if (byte === 10) {
            this.flushTextRow(output)
          } else {
            this.rowState = RowState.Text
          }
          break
        }
        case RowState.Length: {
          const byte = chunk[offset++]
          this.rowBuffer.push(byte)
          if (byte === 44) {
            output.push(Uint8Array.from(this.rowBuffer))
            this.rowBuffer = []
            this.binaryBytesRemaining = this.rowLength
            if (this.binaryBytesRemaining === 0) {
              this.rowState = RowState.Id
            } else {
              this.rowState = RowState.Binary
            }
          } else {
            this.rowLength =
              (this.rowLength << 4) | (byte > 96 ? byte - 87 : byte - 48)
          }
          break
        }
        case RowState.Text: {
          const newline = chunk.indexOf(10, offset)
          if (newline === -1) {
            for (; offset < chunk.byteLength; offset++) {
              this.rowBuffer.push(chunk[offset])
            }
          } else {
            for (; offset <= newline; offset++) {
              this.rowBuffer.push(chunk[offset])
            }
            this.flushTextRow(output)
          }
          break
        }
        case RowState.Binary: {
          const available = chunk.byteLength - offset
          const length = Math.min(available, this.binaryBytesRemaining)
          output.push(chunk.subarray(offset, offset + length))
          offset += length
          this.binaryBytesRemaining -= length
          if (this.binaryBytesRemaining === 0) {
            this.rowState = RowState.Id
          }
          break
        }
        default:
          this.rowState satisfies never
      }
    }

    return output
  }

  flush(): Uint8Array[] {
    if (this.rowBuffer.length === 0) return []
    const remainder = Uint8Array.from(this.rowBuffer)
    this.rowBuffer = []
    return [remainder]
  }

  private flushTextRow(output: Uint8Array[]) {
    const bytes = Uint8Array.from(this.rowBuffer)
    this.rowBuffer = []
    this.rowState = RowState.Id

    const line = this.textDecoder.decode(bytes)
    if (line.startsWith(CHUNKS_DICTIONARY_PREFIX)) {
      try {
        Object.assign(
          this.dictionary,
          JSON.parse(
            line.slice(CHUNKS_DICTIONARY_PREFIX.length).trimEnd()
          ) as ChunksDictionary
        )
      } catch {
        // Preserve malformed control rows. React will surface the protocol
        // error instead of silently dropping data.
        output.push(bytes)
      }
      return
    }

    const match = /^([0-9a-f]+):I(.+)\n$/.exec(line)
    if (!match) {
      output.push(bytes)
      return
    }

    try {
      const metadata = JSON.parse(match[2]) as unknown[]
      const chunksId = metadata[1]
      if (typeof chunksId !== 'string') {
        output.push(bytes)
        return
      }
      const chunks = this.dictionary[chunksId]
      if (!chunks) {
        output.push(bytes)
        return
      }
      metadata[1] = chunks
      output.push(
        this.textEncoder.encode(`${match[1]}:I${JSON.stringify(metadata)}\n`)
      )
    } catch {
      output.push(bytes)
    }
  }
}

export function decodeFlightChunkLists(
  stream: ReadableStream<Uint8Array>,
  initialDictionary?: ChunksDictionary
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  const decoder = new FlightChunkListDecoder(initialDictionary)

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          for (const chunk of decoder.flush()) controller.enqueue(chunk)
          controller.close()
          return
        }
        const decodedChunks = decoder.transform(value)
        for (const chunk of decodedChunks) controller.enqueue(chunk)
        if (decodedChunks.length > 0) return
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

export async function decodeFlightResponse(
  responsePromise: Promise<Response>
): Promise<Response> {
  const response = await responsePromise
  if (!response.body) return response

  const decoded = new Response(decodeFlightChunkLists(response.body), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
  Object.defineProperties(decoded, {
    redirected: { value: response.redirected },
    type: { value: response.type },
    url: { value: response.url },
  })
  return decoded
}
