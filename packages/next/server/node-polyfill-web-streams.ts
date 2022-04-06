import {
  ReadableStream,
  TransformStream,
} from 'next/dist/compiled/web-streams-polyfill'

// Polyfill Web Streams for the Node.js runtime.
// @ts-ignore
global.ReadableStream = ReadableStream
// @ts-ignore
global.TransformStream = TransformStream

export { ReadableStream, TransformStream }
