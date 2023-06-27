// Polyfill Web Streams for the Node.js runtime.
if (!global.ReadableStream) {
  // In Node v16, ReadableStream is available natively but under the `stream` namespace.
  // In Node v18+, it's available under global.
  if (require('stream').ReadableStream) {
    global.ReadableStream = require('stream').ReadableStream
  } else {
    const { ReadableStream } =
      require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
    global.ReadableStream = ReadableStream
  }
}
if (!global.TransformStream) {
  const { TransformStream } =
    require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
  global.TransformStream = TransformStream
}
