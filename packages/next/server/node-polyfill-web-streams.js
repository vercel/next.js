import Primitives from '@edge-runtime/primitives'

// Polyfill Web Streams for the Node.js runtime.
if (!global.ReadableStream) {
  global.ReadableStream = Primitives.ReadableStream
}
if (!global.TransformStream) {
  global.TransformStream = Primitives.TransformStream
}
