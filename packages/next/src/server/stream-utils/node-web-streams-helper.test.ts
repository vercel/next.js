import { setImmediate } from 'timers/promises'
import {
  chainStreams,
  createHeadInsertionTransformStream,
  streamFromString,
  streamToString,
} from './node-web-streams-helper'

async function processReadableStream(
  readableStream: ReadableStream,
  chunks: unknown[]
) {
  const reader = readableStream.getReader()
  let done, value
  for (const chunk of chunks) {
    ;({ done, value } = await reader.read())
    expect(done).toStrictEqual(false)
    expect(value).toStrictEqual(chunk)
  }
  ;({ done, value } = await reader.read())
  expect(done).toStrictEqual(true)
  expect(value).toStrictEqual(undefined)
}

describe('node-web-stream-helpers', () => {
  describe('streamFromString', () => {
    it('should encode the string into a stream', async () => {
      const stream = streamFromString('abc')
      await processReadableStream(stream, [new Uint8Array([97, 98, 99])])
    })
  })
  describe('streamToString', () => {
    it('should decode the stream into a string', async () => {
      const input = 'abc'
      const stream = new TextEncoderStream()
      const p = streamToString(stream.readable)
      const writer = stream.writable.getWriter()
      await writer.write(input)
      await writer.close()
      const output = await p
      expect(output).toStrictEqual(input)
    })
  })
  it('streamFromString and streamToString should be reflective', async () => {
    const input = 'abcdefghijklmnopqrstuvwxyz'
    const stream = streamFromString(input)
    const output = await streamToString(stream)
    expect(output).toBe(input)
  })

  describe('chainStreams', () => {
    it('should throw error on 0 args', () => {
      expect(() => chainStreams()).toThrow(
        'Invariant: chainStreams requires at least one stream'
      )
    })
    it('should return singular stream argument', () => {
      const stream = new ReadableStream()
      const actual = chainStreams(stream)
      expect(actual).toStrictEqual(stream)
    })
    it('should chain streams in order', async () => {
      const createReadableStream = (data: string) => {
        return new ReadableStream({
          start(controller) {
            controller.enqueue(data)
            controller.close()
          },
        })
      }
      const inputs = ['abcd', 'efgh', 'ijkl', 'mnop', 'qrst', 'uvwx', 'yz00']
      const streams = inputs.map((input) => createReadableStream(input))
      const stream = chainStreams(...streams)
      await processReadableStream(stream, inputs)
    })
    it('should throw errors from chained streams', async () => {
      const r1 = new ReadableStream({
        start(controller) {
          controller.enqueue('abcd')
          controller.close()
        },
      })
      const r2 = new ReadableStream({
        start(controller) {
          controller.error(new Error('Error from ReadableStream 2'))
        },
      })
      const chained = chainStreams(r1, r2)
      const reader = chained.getReader()
      const { done, value } = await reader.read()
      expect(done).toStrictEqual(false)
      expect(value).toStrictEqual('abcd')
      try {
        await reader.read()
      } catch (err) {
        expect(err).toStrictEqual(new Error('Error from ReadableStream 2'))
      }
    })
    it('should skip processing a canceled streams', async () => {
      const r1 = new ReadableStream({
        start(controller) {
          controller.enqueue('abcd')
          controller.close()
        },
      })
      const r2 = new ReadableStream({
        start(controller) {
          controller.enqueue('efgh')
          controller.close()
        },
      })
      const r3 = new ReadableStream({
        start(controller) {
          controller.enqueue('ijkl')
          controller.close()
        },
      })
      const chained = chainStreams(r1, r2, r3)
      await r2.cancel()
      await processReadableStream(chained, ['abcd', 'ijkl'])
    })
    describe('chainStreams failure cases', () => {
      // The following tests demonstrate existing issues with the chainStreams function

      it('should hang reading an input stream that is already read from', async () => {
        // This test demonstrates the current issue with the chainStreams function
        // This test will hang at the second read operation of the output stream
        // because the second input stream is already read.
        //
        // Ideally, `chainStreams` should error when it receives a stream thats already locked
        const r1 = new ReadableStream({
          start(controller) {
            controller.enqueue('abcd')
            controller.close()
          },
        })
        const r2 = new ReadableStream({
          start(controller) {
            controller.enqueue('efgh')
            controller.close()
          },
        })
        const r3 = new ReadableStream({
          start(controller) {
            controller.enqueue('ijkl')
            controller.close()
          },
        })
        // read r2 first, before chaining it
        await processReadableStream(r2, ['efgh'])
        // check stream locks - r2 is locked because it was already read
        expect(r1.locked).toStrictEqual(false)
        expect(r2.locked).toStrictEqual(true)
        expect(r3.locked).toStrictEqual(false)
        // chain - doesn't fail, but probably should
        const chained = chainStreams(r1, r2, r3)
        // now r1 is locked too
        expect(r1.locked).toStrictEqual(true)
        expect(r2.locked).toStrictEqual(true)
        expect(r3.locked).toStrictEqual(false)
        // read from chainStreams output
        const reader = chained.getReader()
        const { done, value } = await reader.read()
        expect(done).toStrictEqual(false)
        expect(value).toStrictEqual('abcd')
        // Promise.race will return a promise that settles with the state of
        // the first promise that settles within the list. In Node.js, timers
        // are resolved in a separate stack from other async operations. So,
        // if the chained reader doesn't hang, then `val` will be a normal
        // readable stream read operation output (`{ done, value }`). Instead,
        // since it hangs, the `setImmediate` returns the string `'read hangs'`
        const val = await Promise.race([
          reader.read(),
          setImmediate('read hangs'),
        ])

        expect(val).toStrictEqual('read hangs')
      })
    })
  })

  describe('createBufferedTransformStream', () => {})
  describe('createInsertedHTMLStream', () => {})
  describe('renderToInitialFizzStream', () => {})
  describe('createHeadInsertionTransformStream', () => {
    it('should insert text into head tag', async () => {
      const encoder = new TextEncoder()
      function insert() {
        return Promise.resolve('<foo>bar</foo>')
      }
      const input = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('<head><fuzz>buzz</fuzz></head><body></body>')
          )
          controller.close()
        },
      })
      const stream = createHeadInsertionTransformStream(insert)
      const output = input.pipeThrough(stream)
      await processReadableStream(output, [
        encoder.encode(
          '<head><fuzz>buzz</fuzz><foo>bar</foo></head><body></body>'
        ),
        encoder.encode('<foo>bar</foo>'),
      ])
    })
  })
  describe('createDeferredSuffixStream', () => {})
  describe('createMergedTransformStream', () => {})
  describe('createMoveSuffixStream', () => {})
  describe('createStripDocumentClosingTagsTransform', () => {})
  describe('createRootLayoutValidatorStream', () => {})
  describe('chainTransformers', () => {})
  describe('continueFizzStream', () => {})
  describe('continueDynamicPrerender', () => {})
  describe('continueStaticPrerender', () => {})
  describe('continueDynamicHTMLResume', () => {})
  describe('continueDynamicDataResume', () => {})
})
