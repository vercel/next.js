import { ReadableStream } from './web/sandbox/polyfills'

// Polyfill ReadableStream in the Node.js environment
if (!global.ReadableStream) {
  global.ReadableStream = ReadableStream
}
