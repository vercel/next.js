import {
  chainStreams,
  streamFromString,
  streamToString,
} from './node-web-streams-helper'

describe('node-web-stream-helpers', () => {
  describe('streamFromString', () => {
    it('should encode the string into a stream', async () => {
      const stream = streamFromString('abc')
      const reader = stream.getReader()
      let { done, value } = await reader.read()
      expect(done).toStrictEqual(false)
      expect(value).toStrictEqual(new Uint8Array([97, 98, 99]))
      ;({ done, value } = await reader.read())
      expect(done).toStrictEqual(true)
      expect(value).toStrictEqual(undefined)
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
    it('should chain streams together', async () => {
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
      const chained = chainStreams(r1, r2)
      const reader = chained.getReader()
      let { done, value } = await reader.read()
      expect(done).toStrictEqual(false)
      expect(value).toStrictEqual('abcd')
      ;({ done, value } = await reader.read())
      expect(done).toStrictEqual(false)
      expect(value).toStrictEqual('efgh')
      ;({ done, value } = await reader.read())
      expect(done).toStrictEqual(true)
      expect(value).toStrictEqual(undefined)
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
      let { done, value } = await reader.read()
      expect(done).toStrictEqual(false)
      expect(value).toStrictEqual('abcd')
      try {
        await reader.read()
      } catch (err) {
        expect(err).toStrictEqual(new Error('Error from ReadableStream 2'))
      }
    })
  })

  describe('createBufferedTransformStream', () => {})
  describe('createInsertedHTMLStream', () => {})
  describe('renderToInitialFizzStream', () => {})
  describe('createHeadInsertionTransformStream', () => {})
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
