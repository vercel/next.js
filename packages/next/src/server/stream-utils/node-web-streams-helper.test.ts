import { ReadableStream } from 'node:stream/web'
import { streamFromString, streamToString } from './node-web-streams-helper'

describe('node-web-stream-helpers', () => {
  it('streamFromString and streamToString should be reflective', async () => {
    const input = 'abcdefghijklmnopqrstuvwxyz'
    const stream = streamFromString(input)
    expect(stream).toBeInstanceOf(ReadableStream)
    const output = await streamToString(stream)
    expect(typeof output).toBe('string')
    expect(output).toBe(input)
  })
})
