import {
  ReadableStream,
  TransformStream,
} from 'next/dist/compiled/@edge-runtime/primitives/streams'

// Polyfill Web Streams for the Node.js runtime.
if (!global.ReadableStream) {
  global.ReadableStream = ReadableStream
}
if (!global.TransformStream) {
  global.TransformStream = TransformStream
}
