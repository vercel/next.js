// NOTE: any changes to this file should be mirrored in: test/__mocks__/node-polyfill-web-streams.js

if (process.env.NEXT_RUNTIME !== 'edge') {
  // Polyfill Web Streams for the Node.js runtime.
  if (!global.ReadableStream) {
    // In Node v16, ReadableStream is available natively but under the `stream` namespace.
    // In Node v18+, it's available under global.
    if (require('stream/web').ReadableStream) {
      global.ReadableStream = require('stream/web').ReadableStream
    } else {
      const { ReadableStream } =
        require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
      global.ReadableStream = ReadableStream
    }
  }
  if (!global.WritableStream) {
    // In Node v16, WritableStream is available natively but under the `stream` namespace.
    // In Node v18+, it's available under global.
    if (require('stream/web').WritableStream) {
      global.WritableStream = require('stream/web').WritableStream
    } else {
      const { WritableStream } =
        require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
      global.WritableStream = WritableStream
    }
  }
  if (!global.TransformStream) {
    // Same as ReadableStream above.
    if (require('stream/web').TransformStream) {
      global.TransformStream = require('stream/web').TransformStream
    } else {
      const { TransformStream } =
        require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
      global.TransformStream = TransformStream
    }
  }
}
