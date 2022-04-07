import {
  ReadableStream,
  TransformStream,
} from 'next/dist/compiled/web-streams-polyfill'

// Polyfill Web Streams for the Node.js runtime.
if (!globalThis.ReadableStream) {
  globalThis.ReadableStream = ReadableStream
}
if (!globalThis.TransformStream) {
  globalThis.TransformStream = TransformStream
}
