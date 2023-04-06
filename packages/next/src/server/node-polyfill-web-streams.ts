import {
  ReadableStream,
  TransformStream,
  WritableStream,
  TextEncoderStream,
  TextDecoderStream,
} from 'next/dist/compiled/@edge-runtime/primitives/streams'

// Polyfill Web Streams for the Node.js runtime.
if (!global.ReadableStream) {
  global.ReadableStream = ReadableStream
}
if (!global.TransformStream) {
  global.TransformStream = TransformStream
}
if (!global.WritableStream) {
  global.WritableStream = WritableStream
}
if (!global.TextEncoderStream) {
  global.TextEncoderStream = TextEncoderStream
}
if (!global.TextDecoderStream) {
  global.TextDecoderStream = TextDecoderStream
}
