import { TransformStream } from 'next/dist/compiled/web-streams-polyfill'
import { ReadableStream } from './web/sandbox/readable-stream'

// Polyfill Web Streams in the Node.js environment
if (!global.ReadableStream) {
  global.ReadableStream = ReadableStream
  global.TransformStream = TransformStream
}
