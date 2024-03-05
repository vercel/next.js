import { streamFromString, streamToString } from './node-web-streams-helper'

describe('node-web-stream-helpers', () => {
  describe('streamFromString', () => {
    it('should return a ReadableStream containing the input string', async () => {
      const input = 'abcdef'

      const stream = streamFromString(input)

      let actual = ''

      const decoder = new TextDecoder()

      // @ts-ignore
      for await (const chunk of stream) {
        actual += decoder.decode(chunk, { stream: true })
      }

      actual += decoder.decode()

      expect(actual).toBe(input)
    })
  })

  describe('streamToString', () => {})
})
