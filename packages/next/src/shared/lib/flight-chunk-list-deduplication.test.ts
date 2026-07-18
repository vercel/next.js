import {
  decodeFlightChunkLists,
  FlightChunkListDecoder,
} from './flight-chunk-list-deduplication'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe('Flight chunk list deduplication', () => {
  it('expands dictionary references split across stream chunks', async () => {
    const input =
      '__next_chunks_dict__:{"c1":["/a.js","/b.js"]}\n' +
      '1:I[123,"c1","default"]\n' +
      '0:{"value":"ok"}\n'
    const bytes = encoder.encode(input)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 17))
        controller.enqueue(bytes.subarray(17, 53))
        controller.enqueue(bytes.subarray(53))
        controller.close()
      },
    })

    const output = await new Response(decodeFlightChunkLists(stream)).text()
    expect(output).toBe(
      '1:I[123,["/a.js","/b.js"],"default"]\n0:{"value":"ok"}\n'
    )
  })

  it('preserves binary rows and completeness markers byte-for-byte', () => {
    const flightDecoder = new FlightChunkListDecoder({ c1: ['/a.js'] })
    const prefix = encoder.encode('~1:T4,')
    const binary = new Uint8Array([0, 10, 255, 1])
    const suffix = encoder.encode('2:I[7,"c1","x"]\n')
    const input = new Uint8Array(prefix.length + binary.length + suffix.length)
    input.set(prefix)
    input.set(binary, prefix.length)
    input.set(suffix, prefix.length + binary.length)

    const chunks = [
      ...flightDecoder.transform(input.subarray(0, 5)),
      ...flightDecoder.transform(input.subarray(5, 9)),
      ...flightDecoder.transform(input.subarray(9)),
      ...flightDecoder.flush(),
    ]
    const output = new Uint8Array(
      chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
    )
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.byteLength
    }

    const expectedSuffix = encoder.encode('2:I[7,["/a.js"],"x"]\n')
    expect(output.subarray(0, prefix.length)).toEqual(prefix)
    expect(
      output.subarray(prefix.length, prefix.length + binary.length)
    ).toEqual(binary)
    expect(decoder.decode(output.subarray(prefix.length + binary.length))).toBe(
      decoder.decode(expectedSuffix)
    )
  })
})
