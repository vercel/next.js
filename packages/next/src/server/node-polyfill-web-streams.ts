// Polyfill Web Streams for the Node.js runtime.
if (!global.ReadableStream) {
  const { ReadableStream } =
    require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
  global.ReadableStream = ReadableStream
}
if (!global.TransformStream) {
  const { TransformStream } =
    require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
  global.TransformStream = TransformStream
}
