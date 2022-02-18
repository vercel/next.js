import {
  ReadableStream,
  TransformStream,
} from 'next/dist/compiled/web-streams-polyfill'

// Polyfill Web Streams in the Node.js environment
if (!global.ReadableStream) {
  global.ReadableStream = ReadableStream
  global.TransformStream = TransformStream
}
